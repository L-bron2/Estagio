// Dependências e configuração inicial
const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");
const sql = require("mssql");
const bcrypt = require("bcrypt");
require("dotenv").config();
const cors = require("cors");
const path = require("path");
const XLSX = require("xlsx");
const PDFDocument = require("pdfkit-table");
const { PDFParse } = require("pdf-parse");
const { request } = require("http");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname)));

// Constantes usadas no ficheiro para configurações e validações
const saltRounds = 10;
const PERFIL_FUNCIONARIO = 4;
const PERFIL_GERENTE = 5;
const PERFIL_ADMIN = 6;
const TIPOS_PRODUTO_VALIDOS = ["prodVenda", "prodConsumo", "prodBrinde"];
const ARMAZEM_VALIDOS = [5,6,7];


// Converte um valor em inteiro, devolve null se for ivalido
function toInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// Verifica se um valor é inteiro positivo
function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function normalizarTipoProduto(value) {
  return String(value ?? "").trim();
}

function normalizarArmazem(value) {
  return toInt(value);
}

console.log("DB_SERVER =", process.env.DB_SERVER);
console.log("DB_PORT =", process.env.DB_PORT);
console.log("DB_INSTANCE =", process.env.DB_INSTANCE);

// CONFIG SQL
const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const DAT_DELIMITADORES = [";", "\t", "|", ","];
const XLS_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

// função para saber a extensão do ficheiro  a partir do nome
function obterExtensaoFicheiro(nome = "") {
  return path.extname(String(nome).toLowerCase());
}

// Limita o tamanho de um texto para apresentação
function limitarTexto(valor = "", limite = 120) {
  const texto = String(valor ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!texto) {
    return "";
  }

  return texto.length > limite ? `${texto.slice(0, limite)}...` : texto;
}

// Formata um valor para exibição de preview
function formatarValorPreview(valor) {
  if (valor === null || typeof valor === "undefined") {
    return "";
  }

  if (valor instanceof Date) {
    return valor.toISOString();
  }

  if (typeof valor === "object") {
    return JSON.stringify(valor);
  }

  return String(valor);
}

// Escapa caracteres especiais para uso em RegExp
function escaparParaRegex(valor = "") {
  return String(valor).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Verifica se uma linha  tem alguma célula com conteúdo
function linhaTemConteudo(linha = []) {
  return (
    Array.isArray(linha) &&
    linha.some((coluna) => String(coluna ?? "").trim() !== "")
  );
}

// Verifica se um buffer parece ser um ficheiro XLSX
function bufferPareceXLSX(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.includes(Buffer.from("xl/")) &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b
  );
}

function bufferPareceDOCX(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.includes(Buffer.from("word/")) &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b
  );
}

// Verifica se um buffer parece ser um ficheiro XLS (formato binário )
function bufferPareceXLS(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= XLS_SIGNATURE.length &&
    buffer.subarray(0, XLS_SIGNATURE.length).equals(XLS_SIGNATURE)
  );
}

// Determina qual o delimitador mais provável num ficheiro DAT/CSV
function bufferParecePDF(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 4).toString() === "%PDF";
}

function normalizarMimeType(mimeType = "") {
  return String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

function detetarDelimitadorDAT(linhas = []) {
  const amostra = linhas.slice(0, 20);
  let melhorDelimitador = null;
  let melhorPontuacao = 0;

  for (const delimitador of DAT_DELIMITADORES) {
    const contagens = amostra
      .map(
        (linha) =>
          (linha.match(new RegExp(escaparParaRegex(delimitador), "g")) || [])
            .length,
      )
      .filter((quantidade) => quantidade > 0);

    if (!contagens.length) {
      continue;
    }

    const media =
      contagens.reduce((total, valor) => total + valor, 0) / contagens.length;

    if (media > melhorPontuacao) {
      melhorPontuacao = media;
      melhorDelimitador = delimitador;
    }
  }

  return melhorDelimitador;
}

// Determina o tipo de relatório com base na extensão, mime-type e conteúdo.
function detetarTipoRelatorioUpload(upload) {
  const extensao = obterExtensaoFicheiro(upload.nome);
  const mimeType = normalizarMimeType(upload.tipo);
  const buffer = upload.PDF;

  if (
    extensao === ".doc" ||
    extensao === ".docx" ||
    mimeType === "application/msword" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    bufferPareceDOCX(buffer)
  ) {
    return "word";
  }

  if (
    extensao === ".xlsx" ||
    extensao === ".xls" ||
    mimeType.includes("spreadsheetml") ||
    mimeType.includes("ms-excel") ||
    bufferPareceXLSX(buffer) ||
    bufferPareceXLS(buffer)
  ) {
    return "excel";
  }

  if (
    extensao === ".pdf" ||
    mimeType === "application/pdf" ||
    bufferParecePDF(buffer)
  ) {
    return "pdf";
  }

  if (
    extensao === ".dat" ||
    extensao === ".csv" ||
    extensao === ".txt" ||
    mimeType === "text/plain" ||
    mimeType === "text/csv" ||
    mimeType === "application/csv" ||
    (mimeType === "application/octet-stream" &&
      [".dat", ".csv", ".txt"].includes(extensao))
  ) {
    return "dat";
  }

  return "ficheiro";
}

// Gera um resumo de um buffer Excel
function gerarRelatorioExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const folhas = workbook.SheetNames.map((nomeFolha) => {
    const worksheet = workbook.Sheets[nomeFolha];
    const linhasBrutas = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });

    const linhas = linhasBrutas.filter(linhaTemConteudo);
    const totalColunas = linhas.reduce(
      (maior, linha) =>
        Math.max(maior, Array.isArray(linha) ? linha.length : 0),
      0,
    );

    return {
      nome_folha: nomeFolha,
      total_linhas: linhas.length,
      total_colunas: totalColunas,
      cabecalho: linhas[0] ? linhas[0].map(formatarValorPreview) : [],
      preview: linhas
        .slice(0, 10)
        .map((linha) => linha.map(formatarValorPreview)),
    };
  });

  return {
    tipo_relatorio: "excel",
    total_folhas: folhas.length,
    total_linhas: folhas.reduce(
      (total, folha) => total + folha.total_linhas,
      0,
    ),
    total_colunas_max: folhas.reduce(
      (maior, folha) => Math.max(maior, folha.total_colunas),
      0,
    ),
    folhas,
  };
}

// Gera um resumo de um buffer DAT/CSV/TXT
function gerarRelatorioTexto(texto, tipoRelatorio = "texto", titulo = "Texto") {
  const textoLimpo = String(texto || "").replace(/\u0000/g, "");
  const linhasTexto = textoLimpo
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);

  const delimitador = detetarDelimitadorDAT(linhasTexto);
  const linhasEstruturadas = linhasTexto.map((linha) =>
    delimitador
      ? linha.split(delimitador).map((coluna) => coluna.trim())
      : [linha],
  );
  const totalColunas = linhasEstruturadas.reduce(
    (maior, linha) => Math.max(maior, linha.length),
    0,
  );

  return {
    tipo_relatorio: tipoRelatorio,
    titulo_relatorio: titulo,
    delimitador: delimitador || "sem delimitador",
    total_linhas: linhasTexto.length,
    total_colunas: totalColunas,
    cabecalho: linhasEstruturadas[0] || [],
    preview: linhasEstruturadas.slice(0, 10),
    resumo_texto: limitarTexto(linhasTexto.slice(0, 8).join(" | "), 500),
  };
}

// Gerador de relatório que escolhe entre Excel e DAT
function gerarRelatorioDAT(buffer) {
  return gerarRelatorioTexto(buffer.toString("utf8"), "dat", "Texto");
}

async function gerarRelatorioPDF(upload) {
  let parser = null;

  try {
    parser = new PDFParse({ data: upload.PDF });
    const resultado = await parser.getText();
    const relatorio = gerarRelatorioTexto(
      resultado.text || "",
      "pdf",
      "Texto extraido do PDF",
    );

    return {
      ...relatorio,
      total_paginas:
        resultado.totalPages ||
        resultado.numpages ||
        resultado.pages?.length ||
        null,
    };
  } catch (err) {
    return {
      ...gerarRelatorioGenerico(
        upload,
        "pdf",
        "Nao foi possivel extrair texto deste PDF.",
      ),
      erro_leitura: err.message,
    };
  } finally {
    if (parser) {
      await parser.destroy().catch(() => {});
    }
  }
}

function gerarRelatorioGenerico(upload, tipoRelatorio, resumo) {
  const extensao = obterExtensaoFicheiro(upload.nome) || "sem extensao";

  return {
    tipo_relatorio: tipoRelatorio,
    extensao,
    tipo_mime: upload.tipo || "desconhecido",
    total_linhas: 0,
    total_colunas: 2,
    resumo_texto: resumo,
    detalhes: [
      ["Nome", upload.nome || "-"],
      ["Tipo MIME", upload.tipo || "-"],
      ["Extensao", extensao],
      ["Tamanho", `${Number(upload.Tamanho || upload.tamanho || 0)} bytes`],
      ["Resumo", resumo],
    ],
  };
}

async function gerarRelatorioUpload(upload) {
  const tipoRelatorio = detetarTipoRelatorioUpload(upload);

  if (tipoRelatorio === "excel") {
    return gerarRelatorioExcel(upload.PDF);
  }

  if (tipoRelatorio === "dat") {
    return gerarRelatorioDAT(upload.PDF);
  }

  if (tipoRelatorio === "pdf") {
    return gerarRelatorioPDF(upload);
  }

  if (tipoRelatorio === "word") {
    return gerarRelatorioGenerico(
      upload,
      "word",
      "Ficheiro Word disponivel para relatorio de metadados.",
    );
  }

  return gerarRelatorioGenerico(
    upload,
    "ficheiro",
    "Ficheiro disponivel para relatorio de metadados.",
  );
}

function obterTabelaPreviewRelatorio(relatorio) {
  if (relatorio.tipo_relatorio === "excel") {
    const folha = relatorio.folhas.find((item) => item.total_linhas > 0);

    if (!folha) {
      return {
        headers: ["Resumo"],
        rows: [["Ficheiro Excel sem linhas para apresentar"]],
      };
    }

    const rows = folha.preview.slice(1);

    return {
      headers: folha.cabecalho.length ? folha.cabecalho : ["Conteudo"],
      rows: rows.length ? rows : [["Sem dados"]],
    };
  }

  if (Array.isArray(relatorio.preview)) {
    const rows = relatorio.preview.slice(1);

    return {
      headers: relatorio.cabecalho?.length ? relatorio.cabecalho : ["Conteudo"],
      rows: rows.length ? rows : [["Sem dados"]],
    };
  }

  return {
    headers: ["Campo", "Valor"],
    rows: relatorio.detalhes?.length
      ? relatorio.detalhes
      : [["Resumo", relatorio.resumo_texto || "Sem dados para apresentar"]],
  };
}

//Faz download do PDF processado a partir do relatório do ficheiro guardado
app.get("/download-processado-pdf/:id", async (req, res) => {
  const uploadId = toInt(req.params.id);
  const userId = toInt(req.query.userId);

  if (!isPositiveInt(uploadId)) {
    return res.status(400).json({
      error: "ID inválido",
    });
  }

  try {
    await poolConexao;

    const acesso = await validarAcessoUploads(userId);

    if (!acesso.ok) {
      return res.status(acesso.status).json({
        error: acesso.error,
      });
    }

    const request = pool.request().input("id", sql.Int, uploadId);

    let filtro = "WHERE up.id = @id";

    if (!podeConsultarTodosUploads(acesso.perfilId)) {
      request.input("userId", sql.Int, userId);

      filtro += `
        AND EXISTS (
          SELECT 1
          FROM MovimentosPDF mp
          WHERE mp.pdf_id = up.id
          AND mp.utilizador_id = @userId
        )
      `;
    }

    const result = await request.query(`
      SELECT
        up.id,
        up.nome,
        up.tipo,
        up.PDF
      FROM Upload up
      ${filtro}
    `);

    const upload = result.recordset[0];

    if (!upload) {
      return res.status(404).json({
        error: "Ficheiro não encontrado",
      });
    }

    const relatorio = await gerarRelatorioUpload(upload);
    const tabela = obterTabelaPreviewRelatorio(relatorio);
    let linhas = [tabela.headers, ...tabela.rows];

    // remover linhas vazias
    linhas = linhas.filter(
      (linha) =>
        Array.isArray(linha) && linha.some((c) => String(c).trim() !== ""),
    );

    if (!linhas.length) {
      return res.status(400).json({
        error: "Sem dados para exportar",
      });
    }

    // criar PDF
    const doc = new PDFDocument({
      margin: 20,
      size: "A4",
    });

    const nomeSeguro = upload.nome.replace(/[^\w\d-_]/g, "_");

    res.setHeader("Content-Type", "application/pdf");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="relatorio_${nomeSeguro}.pdf"`,
    );

    doc.pipe(res);

    // título
    doc.fontSize(18).font("Helvetica-Bold").text(`Relatório: ${upload.nome}`, {
      align: "center",
    });

    doc.moveDown();

    // data
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`Gerado em: ${new Date().toLocaleString("pt-PT")}`);

    doc.moveDown();

    const maxLinhas = 100;

    const headers = linhas[0].map((h) => String(h || ""));

    const rows = linhas
      .slice(1, maxLinhas)
      .map((linha) => linha.map((c) => String(c || "")));

    await doc.table(
      {
        headers,
        rows,
      },
      {
        width: 550,

        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(9),

        prepareRow: () => doc.font("Helvetica").fontSize(8),
      },
    );

    if (linhas.length > maxLinhas) {
      doc.moveDown();

      doc.text(`Foram omitidas ${linhas.length - maxLinhas} linhas.`);
    }

    doc.end();
  } catch (err) {
    console.error("Erro ao gerar PDF processado:", err);

    res.status(500).json({
      error: "Erro ao gerar PDF",
    });
  }
});

//SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.Email_USER,
    pass: process.env.Email_PASS,
  },
});

// Normaliza cabeçalho de importação (remove acentos, coloca em maiúsculas e limpa caracteres)
function normalizarCabecalhoImportacao(valor = "") {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

// mapera colunas que tenham o numero de empregado, data e horas diarias
const colunasRegistoFuncionario = {
  numeroEmpregado: ["NUM EMPREGADO", "NUM. EMPREGADO"],
  data: ["DATA"],
  horasDiarias: ["HORAS PRESENCA"],
};

// Procura o índice de uma coluna entre os cabeçalhos normalizados
function encontrarIndiceColuna(cabecalhos, aliases) {
  return cabecalhos.findIndex((cabecalho) => aliases.includes(cabecalho));
}

// Mapeia um cabeçalho de ficheiro para os índices das colunas esperadas
function mapearColunasRegistoFuncionario(cabecalho = []) {
  const cabecalhos = cabecalho.map(normalizarCabecalhoImportacao);

  return Object.fromEntries(
    Object.entries(colunasRegistoFuncionario).map(([campo, aliases]) => [
      campo,
      encontrarIndiceColuna(cabecalhos, aliases),
    ]),
  );
}

// Verifica se o mapa de colunas contém as colunas mínimas para ser considerado um ficheiro de ponto
function mapaTemColunasPonto(mapa) {
  return mapa.numeroEmpregado >= 0 && mapa.data >= 0 && mapa.horasDiarias >= 0;
}

// Tenta encontrar a linha de cabeçalho num conjunto de linhas (procura nos primeiros 40)
function encontrarCabecalhoRegistoFuncionario(linhas = []) {
  const limite = Math.min(linhas.length, 40);

  for (let indice = 0; indice < limite; indice++) {
    const mapa = mapearColunasRegistoFuncionario(linhas[indice]);

    if (mapaTemColunasPonto(mapa)) {
      return { indice, mapa };
    }
  }

  return null;
}

// Obtém o valor de uma célula por índice, devolvendo null se índice inválido
function obterValorLinha(linha = [], indice) {
  return indice >= 0 ? linha[indice] : null;
}

// Extrai todas as linhas de todas as folhas de um buffer Excel
function extrairLinhasExcel(buffer) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });

  return workbook.SheetNames.flatMap((nomeFolha) => {
    const sheet = workbook.Sheets[nomeFolha];
    return XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    });
  });
}

// Extrai linhas de um buffer de texto (CSV/DAT/TXT), detectando delimitador
function extrairLinhasTexto(buffer) {
  const texto = buffer.toString("utf8").replace(/\u0000/g, "");
  const linhasTexto = texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean);
  const delimitador = detetarDelimitadorDAT(linhasTexto);

  return linhasTexto.map((linha) =>
    delimitador
      ? linha.split(delimitador).map((coluna) => coluna.trim())
      : [linha],
  );
}

// Extrai as linhas apropriadas de um upload (escolhe Excel ou texto)
function extrairLinhasRegistoFuncionario(upload) {
  const tipo = detetarTipoRelatorioUpload(upload);

  if (tipo === "excel") {
    return extrairLinhasExcel(upload.PDF);
  }

  if (tipo === "dat") {
    return extrairLinhasTexto(upload.PDF);
  }

  return [];
}

// Normaliza um campo que representa o número do empregado, devolvendo inteiro válido ou null
function normalizarNumeroEmpregado(valor) {
  const texto = String(valor ?? "").trim();

  if (!texto || texto === "-") {
    return null;
  }

  const numeroDireto = Number(texto.replace(",", "."));
  const numero = Number.isNaN(numeroDireto)
    ? Number(texto.replace(/[^\d]/g, ""))
    : numeroDireto;

  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

// Importa registos do ficheiro usando apenas as colunas definidas em colunasRegistoFuncionario()
async function importarRegistosFuncionario(upload) {
  try {
    const linhas = extrairLinhasRegistoFuncionario(upload);

    if (!linhas.length) {
      return {
        sucesso: false,
        aplicavel: false,
        erro: "Ficheiro sem dados",
      };
    }

    const cabecalho = encontrarCabecalhoRegistoFuncionario(linhas);

    if (!cabecalho) {
      return {
        sucesso: false,
        aplicavel: false,
        erro: "Colunas inválidas",
      };
    }

    const linhasDados = linhas.slice(cabecalho.indice + 1);

    // carregar funcionários existentes
    const utilizadoresResult = await pool.request().query(`
        SELECT
          u.codigo,
          f.numero_empregado
        FROM Utilizador u
        INNER JOIN FichaPessoal f
          ON u.codigo = f.utilizador_codigo
        WHERE f.numero_empregado IS NOT NULL
      `);

    const mapaUtilizadores = new Map();

    for (const utilizador of utilizadoresResult.recordset) {
      mapaUtilizadores.set(
        Number(utilizador.numero_empregado),
        utilizador.codigo,
      );
    }

    let importados = 0;
    let atualizados = 0;
    let ignorados = 0;

    const erros = [];

    for (const linha of linhasDados) {
      try {
        // número empregado
        const numeroEmpregado = normalizarNumeroEmpregado(
          obterValorLinha(linha, cabecalho.mapa.numeroEmpregado),
        );

        // data
        const data = converterDataExcel(
          obterValorLinha(linha, cabecalho.mapa.data),
        );

        // horas do dia (já vêm do ficheiro)
        const horasDia = normalizarHorasDecimais(
          obterValorLinha(linha, cabecalho.mapa.horasDiarias),
        );

        // validar número empregado
        if (!numeroEmpregado) {
          ignorados++;

          erros.push({
            motivo: "Número empregado inválido",
            linha,
          });

          continue;
        }

        // validar funcionário
        const utilizadorId = mapaUtilizadores.get(numeroEmpregado);

        if (!utilizadorId) {
          ignorados++;

          erros.push({
            numero_empregado: numeroEmpregado,
            motivo: "Funcionário não encontrado",
          });

          continue;
        }

        // validar data
        if (!data || isNaN(data.getTime())) {
          ignorados++;

          erros.push({
            numero_empregado: numeroEmpregado,
            motivo: "Data inválida",
          });

          continue;
        }

        if (horasDia === null) {
          ignorados++;

          erros.push({
            numero_empregado: numeroEmpregado,
            motivo: "Horas invalidas",
          });

          continue;
        }

        // guardar apenas:
        // utilizador_id
        // data
        // total_horas

        const result = await pool
          .request()
          .input("utilizador_id", sql.Int, utilizadorId)
          .input("data", sql.Date, data)
          .input("total_horas", sql.Decimal(5, 2), horasDia).query(`

              MERGE RegistoFuncionario AS target

              USING (
                SELECT
                  @utilizador_id AS utilizador_id,
                  @data AS data
              ) AS source

              ON
                target.utilizador_id = source.utilizador_id
                AND target.data = source.data

              WHEN MATCHED THEN

                UPDATE SET
                  total_horas = @total_horas

              WHEN NOT MATCHED THEN

                INSERT (
                  utilizador_id,
                  data,
                  total_horas
                )

                VALUES (
                  @utilizador_id,
                  @data,
                  @total_horas
                )

              OUTPUT $action AS acao;

            `);

        const acao = result.recordset[0]?.acao;

        if (acao === "INSERT") {
          importados++;
        } else if (acao === "UPDATE") {
          atualizados++;
        }
      } catch (erroLinha) {
        ignorados++;

        erros.push({
          erro: erroLinha.message,
          linha,
        });
      }
    }

    return {
      sucesso: true,
      total_linhas: linhasDados.length,
      importados,
      atualizados,
      ignorados,
      erros,
    };
  } catch (erro) {
    console.error("Erro importar registos:", erro);

    return {
      sucesso: false,
      erro: erro.message,
    };
  }
}

// Reimporta todos os uploads guardados
async function reimportarRegistosFuncionarioGuardados() {
  const uploads = await pool.request().query(`
    SELECT id, nome, tipo, PDF
    FROM Upload
    ORDER BY DataUpload DESC
  `);

  const resumo = {
    ficheiros: uploads.recordset.length,
    importados: 0,
    atualizados: 0,
    ignorados: 0,
  };

  for (const upload of uploads.recordset) {
    const resultado = await importarRegistosFuncionario(upload);

    if (!resultado.sucesso) {
      continue;
    }

    resumo.importados += resultado.importados || 0;
    resumo.atualizados += resultado.atualizados || 0;
    resumo.ignorados += resultado.ignorados || 0;
  }

  return resumo;
}

// Normaliza horas de Excel/texto para decimal: 8:30 -> 8.5.
function normalizarHorasDecimais(valor) {
  if (valor === null || typeof valor === "undefined") {
    return null;
  }

  if (valor instanceof Date) {
    const total =
      valor.getHours() + valor.getMinutes() / 60 + valor.getSeconds() / 3600;
    return Number(total.toFixed(2));
  }

  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor < 0) {
      return null;
    }

    const total = valor > 0 && valor < 1 ? valor * 24 : valor;
    return Number(total.toFixed(2));
  }

  const texto = String(valor).trim();

  if (!texto || texto === "-" || texto === "--") {
    return null;
  }

  const numeroTexto = Number(texto.replace(",", "."));

  if (!Number.isNaN(numeroTexto) && numeroTexto >= 0) {
    const total =
      numeroTexto > 0 && numeroTexto < 1 ? numeroTexto * 24 : numeroTexto;
    return Number(total.toFixed(2));
  }

  const match = texto.match(/^(\d{1,2})(?::|h)(\d{1,2})(?::(\d{1,2}))?$/i);

  if (!match) {
    return null;
  }

  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  const segundos = Number(match[3] || 0);

  if (minutos >= 60 || segundos >= 60) {
    return null;
  }

  return Number((horas + minutos / 60 + segundos / 3600).toFixed(2));
}

// Converte valores variados (Date, número serial do Excel, ou string) para Date ou null
function converterDataExcel(valor) {
  if (!valor) {
    return null;
  }

  // já é Date
  if (valor instanceof Date) {
    return valor;
  }

  // serial excel
  if (typeof valor === "number") {
    const data = XLSX.SSF.parse_date_code(valor);

    return new Date(data.y, data.m - 1, data.d);
  }

  // string
  const texto = String(valor).trim();

  if (!texto || texto === "-") {
    return null;
  }

  const serialTexto = Number(texto.replace(",", "."));

  if (!Number.isNaN(serialTexto) && serialTexto > 1000) {
    const data = XLSX.SSF.parse_date_code(serialTexto);

    if (data) {
      return new Date(data.y, data.m - 1, data.d);
    }
  }

  const dataDMY = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  if (dataDMY) {
    const ano =
      dataDMY[3].length === 2 ? Number(`20${dataDMY[3]}`) : Number(dataDMY[3]);
    return new Date(ano, Number(dataDMY[2]) - 1, Number(dataDMY[1]));
  }

  const dataYMD = texto.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);

  if (dataYMD) {
    return new Date(
      Number(dataYMD[1]),
      Number(dataYMD[2]) - 1,
      Number(dataYMD[3]),
    );
  }

  const data = new Date(texto);

  return isNaN(data.getTime()) ? null : data;
}

// Envia um email de boas-vindas quando uma conta é criada
async function emailCriarConta(emailDestino, username) {
  const linkLogin = "http://localhost:3000/login/login.html";

  const info = await transporter.sendMail({
    from: `"Sistema" <${process.env.Email_USER}>`,
    to: emailDestino,
    subject: "Conta criada com sucesso ✔",
    text: `Olá ${username}, a tua conta foi criada com sucesso. Acede aqui: ${linkLogin}`,
    html: `
        <div style="font-family: Arial, sans-serif; background:#f4f6fb; padding:20px;">
          
          <div style="max-width:500px; margin:auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
            
            <div style="background:linear-gradient(135deg,#22c55e,#16a34a); padding:20px; color:white; text-align:center;">
              <h2 style="margin:0;">Conta criada com sucesso</h2>
            </div>

            <div style="padding:20px; color:#333;">
              <p>Olá <strong>${username}</strong>,</p>

              <p>A tua conta foi criada com sucesso </p>

              <p style="margin-top:15px;">
                Já podes entrar na tua conta e começar a utilizar o sistema.
              </p>

              <div style="margin-top:25px; text-align:center;">
                <a href="${linkLogin}" 
                  style="background:#22c55e; color:white; padding:12px 20px; text-decoration:none; border-radius:6px; display:inline-block; font-weight:bold;">
                  Aceder ao Login
                </a>
              </div>

              <p style="margin-top:25px; font-size:12px; color:#777;">
                Se não foste tu que criaste esta conta, ignora este email.
              </p>
            </div>

          </div>

        </div>
      `,
  });

  console.log("Email enviado:", info.messageId);
}

// Configuração do multer para uploads em memória
const storage = multer.memoryStorage();
const allowedUploadMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/msexcel",
  "application/x-msexcel",
  "application/x-ms-excel",
  "application/x-excel",
  "application/x-dos_ms_excel",
  "application/xls",
  "application/x-xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/octet-stream",
  "application/csv",
  "application/vnd.ms-office",
]);
const allowedUploadExtensions = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".dat",
];

// Verifica se a extensão do ficheiro é permitida
function hasAllowedUploadExtensions(fileName = "") {
  const extensao = obterExtensaoFicheiro(fileName);
  return allowedUploadExtensions.includes(extensao);
}

function hasAllowedUploadMimeType(mimeType = "") {
  const normalizado = normalizarMimeType(mimeType);
  return !normalizado || allowedUploadMimeTypes.has(normalizado);
}

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const mimeValido = hasAllowedUploadMimeType(file.mimetype);
    const extensaoValida = hasAllowedUploadExtensions(file.originalname);

    if (!extensaoValida) {
      return cb(
        new Error(
          "Apenas ficheiros PDF, DOC, DOCX, XLS, XLSX, CSV, TXT ou DAT sao permitidos",
        ),
      );
    }

    if (!mimeValido) {
      console.warn(
        `MIME inesperado no upload (${file.mimetype}); aceite pela extensao.`,
      );
    }

    cb(null, true);
  },
});

function mensagemErroUpload(err) {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return "Ficheiro demasiado grande. O limite e 10 MB.";
  }

  return err?.message || "Erro ao receber ficheiro";
}

function receberFicheiroUpload(req, res, next) {
  upload.single("pdfFile")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: mensagemErroUpload(err) });
    }

    next();
  });
}

// variavel para conexão a bd
const pool = new sql.ConnectionPool(config);
const poolConexao = pool.connect();
let estruturaProdutosPromise = null;

function garantirEstruturaProdutos() {
  if (!estruturaProdutosPromise) {
    estruturaProdutosPromise = (async () => {
      await poolConexao;

      await pool.request().query(`
        IF COL_LENGTH('Produtos', 'tipoProd') IS NULL
        BEGIN
          ALTER TABLE Produtos ADD tipoProd NVARCHAR(255) NULL
        END
      `);

      await pool.request().query(`
        UPDATE Produtos
        SET tipoProd = 'prodVenda'
        WHERE tipoProd IS NULL
          OR LTRIM(RTRIM(tipoProd)) = ''
          OR tipoProd NOT IN ('prodVenda', 'prodConsumo', 'prodBrinde')
      `);
    })();
  }

  return estruturaProdutosPromise;
}
//criar conta de utilizador (valida permissões e armazém, grava Utilizador)
app.post("/criarConta", async (req, res) => {
  const { username, email, password, armazem_codigo, perfil_id, criador_id } =
    req.body;
  const perfilId = toInt(perfil_id);
  const criadorId = criador_id ? toInt(criador_id) : null;

  if (!username || !email || !password || !armazem_codigo || !perfilId) {
    return res.status(400).json({ message: "Campos obrigatórios em falta" });
  }

  if (![PERFIL_FUNCIONARIO, PERFIL_GERENTE, PERFIL_ADMIN].includes(perfilId)) {
    return res.status(400).json({ message: "Perfil inválido" });
  }

  try {
    await poolConexao;

    // VERIFICAR SE EXISTEM UTILIZADORES
    const total = await pool.request().query(`
      SELECT COUNT(*) as total FROM Utilizador
    `);

    const temUtilizadores = total.recordset[0].total > 0;

    // VALIDAR PERMISSÕES DO CRIADOR
    if (temUtilizadores) {
      if (!criadorId) {
        return res.status(400).json({ message: "criador_id obrigatório" });
      }

      const criador = await pool
        .request()
        .input("criador_id", sql.Int, criadorId)
        .query(`SELECT perfil_id FROM Utilizador WHERE codigo = @criador_id`);

      if (criador.recordset.length === 0) {
        return res.status(400).json({ message: "Criador inválido" });
      }

      const perfilCriador = criador.recordset[0].perfil_id;

      if (perfilCriador === PERFIL_FUNCIONARIO) {
        return res.status(403).json({ message: "Sem permissões" });
      }

      if (perfilCriador === PERFIL_GERENTE && perfilId !== PERFIL_FUNCIONARIO) {
        return res
          .status(403)
          .json({ message: "Gerente só cria funcionários" });
      }

      if (
        perfilCriador === PERFIL_ADMIN &&
        ![PERFIL_FUNCIONARIO, PERFIL_GERENTE, PERFIL_ADMIN].includes(perfilId)
      ) {
        return res.status(403).json({ message: "Perfil inválido" });
      }
    }

    // BUSCAR ARMAZÉM
    const armazem = await pool
      .request()
      .input("codigo_externo", sql.NVarChar(100), armazem_codigo).query(`
        SELECT codigo FROM Armazem WHERE codigo_externo = @codigo_externo
      `);

    if (armazem.recordset.length === 0) {
      return res.status(400).json({ message: "Armazém inválido" });
    }

    const armazem_id = armazem.recordset[0].codigo;

    // HASH DA PASSWORD
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // CRIAR UTILIZADOR
    const result = await pool
      .request()
      .input("nome", sql.NVarChar(100), username)
      .input("email", sql.NVarChar(150), email)
      .input("password", sql.NVarChar(255), passwordHash)
      .input("armazem_id", sql.Int, armazem_id)
      .input("perfil_id", sql.Int, perfilId).query(`
        INSERT INTO Utilizador (nome, email, password, armazem_id, perfil_id)
        OUTPUT INSERTED.codigo
        VALUES (@nome, @email, @password, @armazem_id, @perfil_id)
      `);

    const userId = result.recordset[0].codigo;

    // ENVIO DE EMAIL
    emailCriarConta(email, username).catch((err) => {
      console.error("Erro email:", err);
    });

    res.status(201).json({
      message: "Utilizador criado",
      userId,
    });
  } catch (err) {
    console.error(err);

    if (err.number === 2627) {
      return res.status(400).json({ message: "Email já existe" });
    }

    res.status(500).json({ message: "Erro interno" });
  }
});

//autenticação de utilizador (verifica email/password)
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).send("Email e password sao obrigatorios");
  }

  try {
    await poolConexao;

    const result = await pool.request().input("email", sql.NVarChar(150), email)
      .query(`
        SELECT u.codigo, u.nome, u.email, u.password, u.armazem_id, u.perfil_id,
               u.aceitou_termos,
               a.codigo_externo AS armazem_codigo
        FROM Utilizador u
        LEFT JOIN Armazem a ON u.armazem_id = a.codigo
        WHERE u.email = @email
      `);

    const user = result.recordset[0];

    if (!user) {
      return res.status(401).send("Credenciais inválidas");
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).send("Credenciais inválidas");
    }

    res.json({
      userId: user.codigo,
      nome: user.nome,
      armazem_id: user.armazem_id,
      armazem_codigo: user.armazem_codigo,
      perfil_id: user.perfil_id,
      aceitou_termos: user.aceitou_termos,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro no login");
  }
});

//  aceitar termos para acesso a PDFs e enviar email de confirmação
app.post("/aceitar-termos-pdfs", async (req, res) => {
  const userId = toInt(req.body.userId);

  if (!userId) {
    return res.status(400).json({ error: "userId obrigatório" });
  }

  try {
    await poolConexao;

    // 1. Buscar dados do utilizador
    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT email, nome
        FROM Utilizador
        WHERE codigo = @userId
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ error: "Utilizador não encontrado" });
    }

    const user = result.recordset[0];

    // 2. Atualizar termos
    await pool.request().input("userId", sql.Int, userId).query(`
        UPDATE Utilizador
        SET aceitou_termos = 1
        WHERE codigo = @userId
      `);

    // 3. Enviar email
    const info = await transporter.sendMail({
      from: `"Sistema PDFs" <${process.env.Email_USER}>`,
      to: user.email,
      subject: "Termos aceites ✔",
      text: `Olá ${user.nome}, confirmamos que aceitou os termos.`,

      html: `
      <div style="font-family: Arial, sans-serif; background:#f4f6fb; padding:20px;">

        <div style="max-width:500px; margin:auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 5px 15px rgba(0,0,0,0.1);">

          <div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8); padding:20px; color:white; text-align:center;">
            <h2 style="margin:0;">Termos aceites</h2>
          </div>

          <div style="padding:20px; color:#333;">

            <p>Olá <strong>${user.nome}</strong>,</p>

            <p>Confirmamos que aceitaste os termos de utilização.</p>

            <p style="margin-top:10px;">
              Já tens acesso aos PDFs.
            </p>

          </div>

        </div>

      </div>
      `,
    });

    console.log("Email enviado:", info.messageId);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao processar termos" });
  }
});

//buscar a localizacao guardada do utilizador
app.get("/location/:userId", async (req, res) => {
  const userId = toInt(req.params.userId);

  if (!isPositiveInt(userId)) {
    return res.status(400).json({ error: "userId invalido" });
  }

  try {
    await poolConexao;

    const result = await pool.request().input("userId", sql.Int, userId).query(`
      SELECT [location]
      FROM Utilizador
      WHERE codigo = @userId
    `);

    if (!result.recordset.length) {
      return res.status(404).json({ error: "Utilizador nao encontrado" });
    }

    const location = String(result.recordset[0].location || "").trim();

    return res.json({
      location: location || null,
      bloqueada: Boolean(location),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao buscar localizacao" });
  }
});

//guardar a localizacao (alverca/montijo) apenas uma vez
app.post("/location/:userId", async (req, res) => {
  const userId = toInt(req.params.userId);
  const location = String(req.body.location || "").trim();

  if (!isPositiveInt(userId)) {
    return res.status(400).json({ error: "userId invalido" });
  }

  if (!location) {
    return res.status(400).json({ error: "Localizacao e obrigatoria" });
  }

  try {
    await poolConexao;

    const utilizador = await pool.request().input("userId", sql.Int, userId)
      .query(`
        SELECT [location]
        FROM Utilizador
        WHERE codigo = @userId
      `);

    if (!utilizador.recordset.length) {
      return res.status(404).json({ error: "Utilizador nao encontrado" });
    }

    const locationAtual = String(utilizador.recordset[0].location || "").trim();

    if (locationAtual) {
      return res.status(409).json({
        error: "A localizacao ja foi escolhida e nao pode ser alterada",
        location: locationAtual,
        bloqueada: true,
      });
    }

    const result = await pool
      .request()
      .input("userId", sql.Int, userId)
      .input("location", sql.NVarChar(50), location).query(`
        UPDATE Utilizador
        SET [location] = @location
        WHERE codigo = @userId
          AND NULLIF(LTRIM(RTRIM(ISNULL([location], ''))), '') IS NULL
      `);

    if (result.rowsAffected[0] === 0) {
      const locationGuardada = await pool
        .request()
        .input("userId", sql.Int, userId).query(`
          SELECT [location]
          FROM Utilizador
          WHERE codigo = @userId
        `);

      return res.status(409).json({
        error: "A localizacao ja foi escolhida e nao pode ser alterada",
        location: String(locationGuardada.recordset[0]?.location || "").trim(),
        bloqueada: true,
      });
    }

    return res.json({
      ok: true,
      location,
      bloqueada: true,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao guardar localizacao" });
  }
});

//upload de ficheiro (PDF/Excel/TXT/Csv/Dat), guarda buffer e tenta importar registos
app.post("/upload", receberFicheiroUpload, async (req, res) => {
  try {
    const file = req.file;
    const body = req.body || {};
    const name = String(body.pdfName || file?.originalname || "").trim();
    const userId = toInt(body.userId);

    if (!file) {
      return res.status(400).json({ error: "Ficheiro em falta" });
    }

    if (!isPositiveInt(userId)) {
      return res.status(400).json({ error: "userId obrigatorio" });
    }

    if (!hasAllowedUploadExtensions(file.originalname)) {
      return res.status(400).json({
        error:
          "Apenas ficheiros PDF, DOC, DOCX, XLS, XLSX, CSV, TXT ou DAT sao permitidos",
      });
    }

    await poolConexao;

    const result = await pool
      .request()
      .input("nome", sql.NVarChar(255), name)
      .input("tipo", sql.NVarChar(255), file.mimetype)
      .input("tamanho", sql.Int, file.size)
      .input("conteudo", sql.VarBinary(sql.MAX), file.buffer).query(`
        INSERT INTO Upload (nome, tipo, Tamanho, DataUpload, PDF)
        OUTPUT INSERTED.id, INSERTED.nome
        VALUES (@nome, @tipo, @tamanho, GETDATE(), @conteudo)
      `);

    const pdf = result.recordset[0];

    await pool
      .request()
      .input("pdf_id", sql.Int, pdf.id)
      .input("utilizador_id", sql.Int, userId)
      .input("nome_pdf", sql.NVarChar(255), pdf.nome)
      .input("tipo_movimento", sql.NVarChar(50), "entrada-pdf").query(`
        INSERT INTO MovimentosPDF (pdf_id, utilizador_id, nome_pdf, tipo_movimento, data_movimento)
        VALUES (@pdf_id, @utilizador_id, @nome_pdf, @tipo_movimento, GETDATE())
      `);

    const importacaoFuncionario = await importarRegistosFuncionario({
      nome: name,
      tipo: file.mimetype,
      PDF: file.buffer,
    });

    res.json({ ok: true, importacao_registos: importacaoFuncionario });
  } catch (err) {
    console.error("Erro no upload:", err);

    res.status(500).json({ error: "Erro upload" });
  }
});

// listar produtos e stock filtrado por armazém
app.get("/produtos", async (req, res) => {
  const temFiltroArmazem = String(req.query.armazem_id || "").trim() !== "";
  const armazemId = temFiltroArmazem ? toInt(req.query.armazem_id) : null;
  const tipoProd = normalizarTipoProduto(req.query.tipoProd);

  if (temFiltroArmazem && !isPositiveInt(armazemId)) {
    return res.status(400).send("armazem_id invalido");
  }

  if (tipoProd && !TIPOS_PRODUTO_VALIDOS.includes(tipoProd)) {
    return res.status(400).send("Tipo de produto invalido");
  }

  try {
    await garantirEstruturaProdutos();

    const request = pool.request();
    const filtros = [];

    if (temFiltroArmazem) {
      request.input("armazem_id", sql.Int, armazemId);
      filtros.push("a.codigo = @armazem_id");
    }

    if (tipoProd) {
      request.input("tipoProd", sql.NVarChar(255), tipoProd);
      filtros.push("p.tipoProd = @tipoProd");
    }

    const where = filtros.length ? `WHERE ${filtros.join(" AND ")}` : "";

    const result = await request.query(`
        SELECT 
          p.id,
          p.nome,
          p.fornecedor,
          p.tipoProd,
          a.codigo AS armazem_id,
          ISNULL(SUM(
            CASE 
              WHEN m.tipo_movimento = 'entrada' THEN m.quantidade
              WHEN m.tipo_movimento IN ('consumo','saida','transferencia_saida') THEN -m.quantidade
              WHEN m.tipo_movimento = 'transferencia_entrada' THEN m.quantidade
            END
          ), 0) AS stock,
          a.descricao AS armazem_nome
        FROM Produtos p
        CROSS JOIN Armazem a
        LEFT JOIN Movimentos m 
          ON p.id = m.produto_id 
          AND m.armazem_id = a.codigo
        ${where}
        GROUP BY p.id, p.nome, p.fornecedor, p.tipoProd, a.codigo, a.descricao
        ORDER BY a.descricao ASC, p.nome ASC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao listar produtos");
  }
});

//adicionar stock (regista movimento de entrada)
app.post("/produtos/adicionar-stock", async (req, res) => {
  const produtoId = toInt(req.body.produto_id);
  const quantidadeRecebida = toInt(req.body.quantidade);
  const quantidade =
    Number.isInteger(quantidadeRecebida) && quantidadeRecebida > 0
      ? quantidadeRecebida
      : 1;
  const utilizadorId = toInt(req.body.utilizador_id);
  const armazemId = toInt(req.body.armazem_id);

  if (
    !isPositiveInt(produtoId) ||
    !isPositiveInt(utilizadorId) ||
    !isPositiveInt(armazemId)
  ) {
    return res.status(400).send("Dados invalidos");
  }

  try {
    await poolConexao;

    await pool
      .request()
      .input("id", sql.Int, produtoId)
      .input("qtd", sql.Int, quantidade)
      .input("utilizador_id", sql.Int, utilizadorId)
      .input("armazem_id", sql.Int, armazemId).query(`
        INSERT INTO Movimentos 
        (produto_id, quantidade, tipo_movimento, data_movimento, utilizador_id, armazem_id)
        VALUES (@id, @qtd, 'entrada', GETDATE(), @utilizador_id, @armazem_id)
      `);

    res.send("Stock atualizado com sucesso");
  } catch (err) {
    res.status(500).send("Erro ao adicionar stock");
  }
});

//remover stock
app.post("/produtos/remover-stock", async (req, res) => {
  const utilizador_id = toInt(req.body.utilizador_id);
  const produtoId = toInt(req.body.produto_id);
  const quantidadeRecebida = toInt(req.body.quantidade);
  const armazemId = toInt(req.body.armazem_id);
  const quantidade =
    Number.isInteger(quantidadeRecebida) && quantidadeRecebida > 0
      ? quantidadeRecebida
      : 1;

  if (
    !isPositiveInt(produtoId) ||
    !isPositiveInt(armazemId) ||
    !isPositiveInt(utilizador_id)
  ) {
    return res.status(400).json({ error: "Dados inválidos" });
  }

  try {
    await poolConexao;

    const result = await pool
      .request()
      .input("produto_id", sql.Int, produtoId)
      .input("armazem_id", sql.Int, armazemId).query(`
        SELECT
          ISNULL(SUM(
            CASE 
              WHEN tipo_movimento = 'entrada' THEN quantidade
              WHEN tipo_movimento IN ('consumo','saida','transferencia_saida') THEN -quantidade
              WHEN tipo_movimento = 'transferencia_entrada' THEN quantidade
            END
          ), 0) AS stock_atual
        FROM Movimentos
        WHERE produto_id = @produto_id 
        AND armazem_id = @armazem_id
      `);

    const stockAtual = Number(result.recordset[0]?.stock_atual || 0);

    if (stockAtual < quantidade) {
      return res.status(400).json({ error: "Stock insuficiente" });
    }

    await pool
      .request()
      .input("utilizador_id", sql.Int, utilizador_id)
      .input("produto_id", sql.Int, produtoId)
      .input("quantidade", sql.Int, quantidade)
      .input("armazem_id", sql.Int, armazemId)
      .input("tipo", sql.NVarChar(50), "saida").query(`
        INSERT INTO Movimentos
        (produto_id, quantidade, tipo_movimento, data_movimento, utilizador_id, armazem_id)
        VALUES (@produto_id, @quantidade, @tipo, GETDATE(), @utilizador_id, @armazem_id)
      `);

    return res.json({ message: "Stock atualizado com sucesso" });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Erro ao processar remoção de stock" });
  }
});

//criar produto e registar tipo de movimento
app.post("/produtos", async (req, res) => {
  const { nome, fornecedor, tipoProd } = req.body;
  const nomeVal = String(nome || "").trim();
  const fornecedorVal = String(fornecedor || "").trim();
  const tipoProdVal = normalizarTipoProduto(tipoProd);
  const quantidade = Math.max(toInt(req.body.stock) || 0, 0);
  const utilizadorId = toInt(req.body.utilizador_id);
  const armazemSessaoId = toInt(req.body.armazem_id);
  const armazemDestinoId =
    normalizarArmazem(req.body.armazemDestino) || armazemSessaoId;

  if (!nomeVal) {
    return res.status(400).send("Nome obrigatório");
  }

  if (!fornecedorVal) {
    return res.status(400).send("Fornecedor obrigatório");
  }

  if (!isPositiveInt(utilizadorId) || !isPositiveInt(armazemDestinoId)) {
    return res.status(400).send("utilizador_id e armazem_id são obrigatórios");
  }

  if (!TIPOS_PRODUTO_VALIDOS.includes(tipoProdVal)) {
    return res.status(400).send("Tipo de produto inválido");
  }

  const transaction = new sql.Transaction(pool);
  let transactionStarted = false;

  try {
    await garantirEstruturaProdutos();

    const armazemResult = await pool
      .request()
      .input("armazem_id", sql.Int, armazemDestinoId).query(`
        SELECT codigo
        FROM Armazem
        WHERE codigo = @armazem_id
      `);

    if (!armazemResult.recordset.length) {
      return res.status(400).send("Armazem invalido");
    }

    await transaction.begin();
    transactionStarted = true;

    const produtoResult = await new sql.Request(transaction)
      .input("nome", sql.NVarChar(255), nomeVal)
      .input("fornecedor", sql.NVarChar(255), fornecedorVal)
      .input("tipoProd", sql.NVarChar(255), tipoProdVal).query(`
        INSERT INTO Produtos (nome, fornecedor, tipoProd)
        OUTPUT INSERTED.id
        VALUES (@nome, @fornecedor, @tipoProd)
      `);

    const produtoId = produtoResult.recordset[0].id;

    await new sql.Request(transaction)
      .input("produto_id", sql.Int, produtoId)
      .input("quantidade", sql.Int, quantidade)
      .input("tipo", sql.NVarChar(50), "entrada")
      .input("utilizador_id", sql.Int, utilizadorId)
      .input("armazem_id", sql.Int, armazemDestinoId).query(`
        INSERT INTO Movimentos 
        (produto_id, quantidade, tipo_movimento, data_movimento, utilizador_id, armazem_id)
        VALUES (@produto_id, @quantidade, @tipo, GETDATE(), @utilizador_id, @armazem_id)
      `);

    await transaction.commit();

    return res.status(201).json({
      id: produtoId,
      armazem_id: armazemDestinoId,
      message: "Produto criado",
    });

  } catch (err) {
    if (transactionStarted && transaction._aborted !== true) {
      await transaction.rollback().catch(() => {});
    }
    console.error(err);
    res.status(500).send("Erro ao criar produto");
  }
});

// atualizar fornecedor do produto
app.post("/produtos/:id", async (req, res) => {
  const id = toInt(req.params.id);
  const fornecedorVal = String(req.body.fornecedor || "").trim();

  if (!isPositiveInt(id)) {
    return res.status(400).send("Produto invalido");
  }

  if (!fornecedorVal) {
    return res.status(400).send("Fornecedor obrigatorio");
  }

  try {
    await garantirEstruturaProdutos();

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("fornecedor", sql.NVarChar(255), fornecedorVal).query(`
        UPDATE Produtos
        SET fornecedor = @fornecedor
        OUTPUT INSERTED.id, INSERTED.fornecedor
        WHERE id = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).send("Produto nao encontrado");
    }

    res.json({
      message: "Produto atualizado",
      produto: result.recordset[0],
    });
  } catch (err) {
    console.error("Erro ao atualizar produto:", err);
    res.status(500).send("Erro ao atualizar produto");
  }
});

// apagar produto e historico (restrito a gerente/admin)
app.delete("/produtos/:id", async (req, res) => {
  const id = toInt(req.params.id);
  const userId = toInt(req.body.userId);

  if (!isPositiveInt(id) || !isPositiveInt(userId)) {
    return res.status(401).json({ message: "ID de utilizador inválido" });
  }

  try {
    await poolConexao;

    // Verificar perfil do utilizador
    const userResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query(`SELECT perfil_id FROM Utilizador WHERE codigo = @userId`);

    if (userResult.recordset.length === 0) {
      return res.status(401).json({ message: "Utilizador não encontrado" });
    }

    const perfilId = userResult.recordset[0].perfil_id;

    // Apenas Gerentes (5) e Administradores (6) podem apagar produtos
    if (perfilId !== PERFIL_GERENTE && perfilId !== PERFIL_ADMIN) {
      return res.status(403).json({
        message: "Apenas gerentes e administradores podem apagar produtos",
      });
    }

    const transaction = new sql.Transaction(pool);

    // garantir que apaga
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
      request.input("id", sql.Int, id);

      // Apagar da tabela Consumos
      await request.query("DELETE FROM Consumos WHERE produto_id = @id");

      //  Apagar da tabela Movimentos
      await request.query("DELETE FROM Movimentos WHERE produto_id = @id");

      // apagar o Produto
      const result = await request.query("DELETE FROM Produtos WHERE id = @id");

      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).send("Produto não encontrado.");
      }

      await transaction.commit();
      res.send("Produto e todo o seu histórico foram apagados com sucesso.");
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error("Erro ao apagar produto:", err);
    res.status(500).send("Erro interno ao apagar produto.");
  }
});

//devolve número total de produtos
app.get("/numeroTotalProdutos", async (req, res) => {
  try {
    await poolConexao;
    const result = await pool
      .request()
      .query("SELECT COUNT(*) AS total FROM Produtos");

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Erro ao calcular número de produtos", err);
    res.status(500).send("Erro ao processar contagem");
  }
});

//listar todos os movimentos (entradas, saídas, transferências, consumos)
app.get("/movimentos", async (req, res) => {
  try {
    await poolConexao;

    const result = await pool.request().query(`
      SELECT 
        m.id,
        p.nome,
        u.nome AS utilizador, 
        a.descricao AS armazem, 
        m.tipo_movimento,
        m.quantidade,
        FORMAT(m.data_movimento, 'dd/MM/yyyy HH:mm:ss') AS data
      FROM Movimentos m
      INNER JOIN Produtos p ON m.produto_id = p.id
      INNER JOIN Utilizador u ON m.utilizador_id = u.codigo
      INNER JOIN Armazem a ON m.armazem_id = a.codigo
      ORDER BY m.data_movimento DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao listar movimentos");
  }
});

//registar consumo (cria entrada em Consumos e Movimentos)
app.post("/NovoConsumo", async (req, res) => {
  const { produto_id, quantidade, utilizador_id, armazem_id } = req.body;

  const produtoId = parseInt(produto_id, 10);
  const quantidadeInt = parseInt(quantidade, 10);
  const utilizadorId = parseInt(utilizador_id, 10);
  const armazemId = parseInt(armazem_id, 10);

  if (
    Number.isNaN(produtoId) ||
    Number.isNaN(quantidadeInt) ||
    Number.isNaN(utilizadorId) ||
    Number.isNaN(armazemId) ||
    quantidadeInt <= 0
  ) {
    return res.status(400).send("Dados inválidos");
  }

  const transaction = new sql.Transaction(pool);

  try {
    await poolConexao;
    await transaction.begin();

    const request = new sql.Request(transaction);

    // VERIFICAR STOCK ATUAL
    const stockResult = await request
      .input("produto_id", sql.Int, produtoId)
      .input("armazem_id", sql.Int, armazemId).query(`
        SELECT 
          ISNULL(SUM(
            CASE 
              WHEN tipo_movimento = 'entrada' THEN quantidade
              WHEN tipo_movimento = 'transferencia_entrada' THEN quantidade
              WHEN tipo_movimento IN ('consumo','saida','transferencia_saida') THEN -quantidade
            END
          ), 0) AS stock
        FROM Movimentos
        WHERE produto_id = @produto_id AND armazem_id = @armazem_id
      `);

    const stockAtual = stockResult.recordset[0].stock;

    if (quantidadeInt > stockAtual) {
      await transaction.rollback();
      return res.status(400).send("Stock insuficiente");
    }

    //  INSERIR CONSUMO
    await request
      .input("quantidade", sql.Int, quantidadeInt)
      .input("utilizador_id", sql.Int, utilizadorId).query(`
        INSERT INTO Consumos 
        (produto_id, quantidade, utilizador_id, armazem_id, data_consumo)
        VALUES (@produto_id, @quantidade, @utilizador_id, @armazem_id, GETDATE())
      `);

    // REGISTAR MOVIMENTO
    await request.input("tipo", sql.NVarChar(50), "consumo").query(`
        INSERT INTO Movimentos 
        (produto_id, quantidade, tipo_movimento, data_movimento, utilizador_id, armazem_id)
        VALUES (@produto_id, @quantidade, @tipo, GETDATE(), @utilizador_id, @armazem_id)
      `);

    await transaction.commit();

    res.status(201).send("Consumo registado com sucesso");
  } catch (err) {
    if (transaction._aborted !== true) {
      await transaction.rollback();
    }
    console.error(err);
    res.status(500).send("Erro no consumo");
  }
});

//registar contagem de produto
app.post("/RegistrarContegem", async (req, res) => {
  const { produto_id, quantidade, utilizador_id, armazem_id } = req.body;

  const produtoId = parseInt(produto_id, 10);
  const quantidadeInt = parseInt(quantidade, 10);
  const utilizadorId = parseInt(utilizador_id, 10);
  const armazemId = parseInt(armazem_id, 10);

  if (
    Number.isNaN(produtoId) ||
    Number.isNaN(quantidadeInt) ||
    Number.isNaN(utilizadorId) ||
    Number.isNaN(armazemId) ||
    quantidadeInt <= 0
  ) {
    return res.status(400).send("Dados inválidos");
  }

  const transaction = new sql.Transaction(pool);

  try {
    await poolConexao;
    await transaction.begin();

    const stockRequest = new sql.Request(transaction);

    // VERIFICAR STOCK ATUAL
    const stockResult = await stockRequest
      .input("produto_id", sql.Int, produtoId)
      .input("armazem_id", sql.Int, armazemId).query(`
        SELECT 
          ISNULL(SUM(
            CASE 
              WHEN tipo_movimento = 'entrada' THEN quantidade
              WHEN tipo_movimento = 'transferencia_entrada' THEN quantidade
              WHEN tipo_movimento IN ('consumo','saida','transferencia_saida') THEN -quantidade
            END
          ), 0) AS stock
        FROM Movimentos
        WHERE produto_id = @produto_id AND armazem_id = @armazem_id
      `);

    const stockAtual = stockResult.recordset[0].stock;

    if (quantidadeInt > stockAtual) {
      await transaction.rollback();
      return res.status(400).send("Stock insuficiente");
    }

    // REGISTAR MOVIMENTO DE CONTAGEM
    const insertRequest = new sql.Request(transaction);
    await insertRequest
      .input("produto_id", sql.Int, produtoId)
      .input("quantidade", sql.Int, quantidadeInt)
      .input("utilizador_id", sql.Int, utilizadorId)
      .input("armazem_id", sql.Int, armazemId)
      .input("tipo", sql.NVarChar(50), "Contagem").query(`
        INSERT INTO Movimentos 
        (produto_id, quantidade, tipo_movimento, data_movimento, utilizador_id, armazem_id)
        VALUES (@produto_id, @quantidade, @tipo, GETDATE(), @utilizador_id, @armazem_id)
      `);

    await transaction.commit();

    res.status(201).send("Contagem registada com sucesso");
  } catch (err) {
    if (transaction._aborted !== true) {
      await transaction.rollback();
    }
    console.error(err);
    res.status(500).send("Erro ao registrar contagem");
  }
});

//listar consumos registados
app.get("/consumo", async (req, res) => {
  try {
    await poolConexao;

    const result = await pool.request().query(`
      SELECT 
        c.id,
        p.nome,
        c.quantidade AS total_consumido,
        FORMAT(c.data_consumo, 'dd/MM/yyyy') AS data
      FROM Consumos c
      INNER JOIN Produtos p ON c.produto_id = p.id
      ORDER BY c.data_consumo DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao listar consumos");
  }
});

//devolve número total de consumos
app.get("/TotalConsumo", async (req, res) => {
  try {
    await poolConexao;
    const result = await pool
      .request()
      .query(`SELECT COUNT(*) AS total FROM Consumos`);

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Erro ao calcular número de consumo", err);
    res.status(500).send("Erro ao processar contagem");
  }
});

//apagar consumo (restrito a gerente/admin)
app.delete("/consumivel/:id", async (req, res) => {
  const id = toInt(req.params.id);
  const userId = toInt(req.body.userId);

  if (!isPositiveInt(id) || !isPositiveInt(userId)) {
    return res.status(401).json({ message: "Utilizador não autenticado" });
  }

  try {
    await poolConexao;

    // Verificar perfil do utilizador
    const userResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query(`SELECT perfil_id FROM Utilizador WHERE codigo = @userId`);

    if (userResult.recordset.length === 0) {
      return res.status(401).json({ message: "Utilizador não encontrado" });
    }

    const perfilId = userResult.recordset[0].perfil_id;

    // Apenas Gerentes (5) e Administradores (6) podem apagar consumos
    if (perfilId !== PERFIL_GERENTE && perfilId !== PERFIL_ADMIN) {
      return res.status(403).json({
        message: "Apenas gerentes e administradores podem apagar consumos",
      });
    }

    //  buscar consumo
    const consumo = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`SELECT * FROM Consumos WHERE id = @id`);

    if (consumo.recordset.length === 0) {
      return res.status(404).send("Consumo não encontrado");
    }

    const c = consumo.recordset[0];

    // apagar movimento correspondente
    await pool
      .request()
      .input("produto_id", sql.Int, c.produto_id)
      .input("quantidade", sql.Int, c.quantidade).query(`
        DELETE FROM Movimentos
        WHERE produto_id = @produto_id
        AND quantidade = @quantidade
        AND tipo_movimento = 'consumo'
      `);

    //apagar consumo
    await pool
      .request()
      .input("id", sql.Int, id)
      .query(`DELETE FROM Consumos WHERE id = @id`);

    res.send("Consumo apagado corretamente");
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao apagar consumo");
  }
});

//criar contagem de stock (regista movimentos do tipo 'contagem')
app.post("/contagem", async (req, res) => {
  const utilizadorId = toInt(req.body.utilizador_id);
  const armazemId = toInt(req.body.armazem_id);

  if (!isPositiveInt(utilizadorId) || !isPositiveInt(armazemId)) {
    return res.status(400).send("utilizador_id e armazem_id são obrigatórios");
  }

  try {
    await poolConexao;

    await pool
      .request()
      .input("utilizador_id", sql.Int, utilizadorId)
      .input("armazem_id", sql.Int, armazemId).query(`
        INSERT INTO Movimentos (produto_id, tipo_movimento, quantidade, utilizador_id, armazem_id, data_movimento)
        SELECT 
          p.id,
          'contagem',
          ISNULL(SUM(
            CASE 
              WHEN m.tipo_movimento = 'entrada' THEN m.quantidade
              WHEN m.tipo_movimento = 'consumo' THEN -m.quantidade
              WHEN m.tipo_movimento = 'saida' THEN -m.quantidade
              WHEN m.tipo_movimento = 'transferencia_entrada' THEN m.quantidade
              WHEN m.tipo_movimento = 'transferencia_saida' THEN -m.quantidade
              ELSE 0
            END
          ), 0) AS stock,
          @utilizador_id,
          @armazem_id,
          GETDATE()
        FROM Produtos p
        LEFT JOIN Movimentos m ON p.id = m.produto_id AND m.armazem_id = @armazem_id
        GROUP BY p.id
      `);

    res.json({ message: "Contagem feita com sucesso" });
  } catch (err) {
    console.error("ERRO POST CONTAGEM:", err);
    res.status(500).json({ error: "Erro ao guardar contagem: " + err.message });
  }
});

//listar contagem por armazém
app.get("/contagem", async (req, res) => {
  const armazemId = toInt(req.query.armazem_id);

  if (!isPositiveInt(armazemId)) {
    return res.status(400).send("armazem_id é obrigatório");
  }

  try {
    await poolConexao;

    const result = await pool.request().input("armazem_id", sql.Int, armazemId)
      .query(`
      SELECT 
        p.id,
        p.nome,
        a.descricao AS armazem_nome,
        ISNULL(SUM(
          CASE 
            WHEN m.tipo_movimento = 'entrada' THEN m.quantidade
            WHEN m.tipo_movimento = 'consumo' THEN -m.quantidade
            WHEN m.tipo_movimento = 'saida' THEN -m.quantidade
            WHEN m.tipo_movimento = 'transferencia_entrada' THEN m.quantidade
            WHEN m.tipo_movimento = 'transferencia_saida' THEN -m.quantidade
            ELSE 0
          END
        ), 0) AS quantidade,
        GETDATE() as data_contagem
      FROM Produtos p
      LEFT JOIN Movimentos m 
        ON p.id = m.produto_id AND m.armazem_id = @armazem_id
      LEFT JOIN Armazem a ON a.codigo = @armazem_id
      GROUP BY p.id, p.nome, a.descricao
      ORDER BY p.nome
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("ERRO CONTAGEM:", err);
    res.status(500).send("Erro no servidor");
  }
});

//verificar se o utilizador tem acesso ao armazém/páginas
app.post("/verificar-acesso", async (req, res) => {
  let { userId, armazem_codigo } = req.body;

  if (!userId || !armazem_codigo) {
    return res.status(400).json({
      error: "ID do utilizador e código do armazém são obrigatórios.",
    });
  }

  try {
    const userIdInt = toInt(userId);

    if (!userIdInt) {
      return res
        .status(400)
        .json({ error: "O código de utilizador deve ser um número válido." });
    }

    await poolConexao;

    const result = await pool
      .request()
      .input("userId", sql.Int, userIdInt)
      .input("armazem_codigo", sql.NVarChar(50), armazem_codigo).query(`
        SELECT u.codigo, u.nome, u.armazem_id, u.perfil_id, a.codigo_externo AS armazem_codigo
        FROM Utilizador u
        INNER JOIN Armazem a ON u.armazem_id = a.codigo
        WHERE u.codigo = @userId AND a.codigo_externo = @armazem_codigo
      `);

    if (result.recordset.length === 0) {
      console.log(
        `Acesso negado: userId=${userIdInt}, armazem_codigo=${armazem_codigo}`,
      );
      return res.status(401).json({ error: "Código ou Armazém inválidos" });
    }

    const user = result.recordset[0];
    console.log(
      `Acesso concedido: userId=${user.codigo}, armazem_id=${user.armazem_id}, perfil=${user.perfil_id}`,
    );

    res.json({
      userId: user.codigo,
      nome: user.nome,
      armazem_id: user.armazem_id,
      armazem_codigo: user.armazem_codigo,
      perfil_id: user.perfil_id,
    });
  } catch (err) {
    console.error("Erro em /verificar-acesso:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

//obter dados do utilizador por id
app.get("/utilizador/:id", async (req, res) => {
  const id = toInt(req.params.id);

  if (!isPositiveInt(id)) {
    return res.status(400).json({ error: "ID invÃ¡lido" });
  }

  try {
    await poolConexao;

    const result = await pool.request().input("codigo", sql.Int, id).query(`
        SELECT u.codigo, u.nome, u.email, u.armazem_id, u.perfil_id, a.codigo_externo AS armazem_codigo
        FROM Utilizador u
        LEFT JOIN Armazem a ON u.armazem_id = a.codigo
        WHERE u.codigo = @codigo
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ error: "Utilizador não encontrado" });
    }

    const user = result.recordset[0];
    res.json({
      userId: user.codigo,
      nome: user.nome,
      email: user.email,
      armazem_id: user.armazem_id,
      armazem_codigo: user.armazem_codigo,
      perfil_id: user.perfil_id,
    });
  } catch (err) {
    console.error("Erro ao obter utilizador:", err);
    res.status(500).json({ error: "Erro ao obter dados do utilizador" });
  }
});

//listar armazéns disponíveis
app.get("/armazens", async (req, res) => {
  try {
    await poolConexao;
    const result = await pool.request().query(`
      SELECT codigo, descricao FROM Armazem ORDER BY descricao
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Erro ao listar armazéns:", err);
    res.status(500).send("Erro ao listar armazéns");
  }
});

// transferir produtos entre armazéns (regista saída e entrada)
app.post("/transferir-produtos", async (req, res) => {
  const armazemOrigem = toInt(req.body.armazem_origem);
  const armazemDestino = toInt(req.body.armazem_destino);
  const utilizadorId = toInt(req.body.utilizador_id);
  const { transferencias } = req.body;

  if (
    !isPositiveInt(armazemOrigem) ||
    !isPositiveInt(armazemDestino) ||
    !transferencias ||
    transferencias.length === 0
  ) {
    return res.status(400).send("Dados inválidos");
  }

  if (armazemOrigem === armazemDestino) {
    return res
      .status(400)
      .send("Armazéns de origem e destino não podem ser iguais");
  }

  if (!isPositiveInt(utilizadorId)) {
    return res.status(400).send("ID de utilizador inválido");
  }

  // Validar perfil do utilizador para regras de transferência
  const usuarioResult = await pool
    .request()
    .input("utilizador_id", sql.Int, utilizadorId).query(`
      SELECT perfil_id, armazem_id
      FROM Utilizador
      WHERE codigo = @utilizador_id
    `);

  if (!usuarioResult.recordset.length) {
    return res.status(400).send("Utilizador não encontrado");
  }

  const usuario = usuarioResult.recordset[0];

  // Funcionário (perfil 4) só pode transferir a partir do seu armazém de origem
  if (
    usuario.perfil_id === PERFIL_FUNCIONARIO &&
    usuario.armazem_id !== armazemOrigem
  ) {
    return res
      .status(403)
      .send(
        "Funcionários só podem transferir a partir do seu armazém de origem",
      );
  }

  const transaction = new sql.Transaction(pool);

  try {
    await poolConexao;
    await transaction.begin();

    // Processar cada transferência
    for (const trans of transferencias) {
      const produtoId = toInt(trans.produto_id);
      const quantidade = toInt(trans.quantidade);

      if (!isPositiveInt(produtoId) || !isPositiveInt(quantidade)) {
        await transaction.rollback();
        return res.status(400).send("Dados de transferência inválidos");
      }

      // Verificar stock no armazém de origem
      let request = new sql.Request(transaction);
      const stockResult = await request
        .input("produto_id", sql.Int, produtoId)
        .input("armazem_origem", sql.Int, armazemOrigem).query(`
          SELECT 
            ISNULL(SUM(
              CASE 
                WHEN tipo_movimento = 'entrada' THEN quantidade
                WHEN tipo_movimento IN ('consumo','saida','transferencia_saida') THEN -quantidade
                WHEN tipo_movimento = 'transferencia_entrada' THEN quantidade
              END
            ), 0) AS stock
          FROM Movimentos
          WHERE produto_id = @produto_id AND armazem_id = @armazem_origem
        `);

      const stockAtual = stockResult.recordset[0].stock;

      if (quantidade > stockAtual) {
        await transaction.rollback();
        return res
          .status(400)
          .send(`Stock insuficiente para o produto ID ${produtoId}`);
      }

      // Registar TRANSFERÊNCIA SAÍDA do armazém de origem
      request = new sql.Request(transaction);
      await request
        .input("produto_id", sql.Int, produtoId)
        .input("quantidade", sql.Int, quantidade)
        .input("utilizador_id", sql.Int, utilizadorId)
        .input("armazem_origem", sql.Int, armazemOrigem).query(`
          INSERT INTO Movimentos
          (produto_id, quantidade, tipo_movimento, data_movimento, utilizador_id, armazem_id)
          VALUES (@produto_id, @quantidade, 'transferencia_saida', GETDATE(), @utilizador_id, @armazem_origem)
        `);

      // Registar TRANSFERÊNCIA ENTRADA no armazém de destino
      request = new sql.Request(transaction);
      await request
        .input("produto_id", sql.Int, produtoId)
        .input("quantidade", sql.Int, quantidade)
        .input("utilizador_id", sql.Int, utilizadorId)
        .input("armazem_destino", sql.Int, armazemDestino).query(`
          INSERT INTO Movimentos
          (produto_id, quantidade, tipo_movimento, data_movimento, utilizador_id, armazem_id)
          VALUES (@produto_id, @quantidade, 'transferencia_entrada', GETDATE(), @utilizador_id, @armazem_destino)
        `);
    }

    await transaction.commit();
    res.status(201).send("Transferência realizada com sucesso");
  } catch (err) {
    if (transaction._aborted !== true) {
      await transaction.rollback();
    }
    console.error("Erro na transferência:", err);
    res.status(500).send("Erro na transferência");
  }
});

// gerar relatório de stock (opções de filtro por armazém/nome/quantidade)
app.get("/relatorios/stock", async (req, res) => {
  const { armazem_id, produto_nome, quantidade_filtro } = req.query;

  try {
    await poolConexao;

    let query = `
      SELECT
        p.id,
        p.nome,
        p.fornecedor,
        a.descricao AS armazem_nome,
        a.codigo AS armazem_codigo,
        ISNULL(SUM(
          CASE
            WHEN m.tipo_movimento = 'entrada' THEN m.quantidade
            WHEN m.tipo_movimento IN ('consumo','saida','transferencia_saida') THEN -m.quantidade
            WHEN m.tipo_movimento = 'transferencia_entrada' THEN m.quantidade
          END
        ), 0) AS stock
      FROM Produtos p
      CROSS JOIN Armazem a
      LEFT JOIN Movimentos m ON p.id = m.produto_id AND a.codigo = m.armazem_id
    `;

    const conditions = [];
    const request = pool.request();

    if (armazem_id) {
      conditions.push("a.codigo = @armazem_id");
      request.input("armazem_id", sql.Int, armazem_id);
    }

    if (produto_nome) {
      conditions.push("p.nome LIKE @produto_nome");
      request.input("produto_nome", sql.NVarChar(255), `%${produto_nome}%`);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query +=
      " GROUP BY p.id, p.nome, p.fornecedor, a.descricao, a.codigo ORDER BY a.descricao, p.nome";

    const result = await request.query(query);
    let resultados = result.recordset;

    // filtro de quantidade no lado do servidor
    if (quantidade_filtro) {
      resultados = resultados.filter((item) => {
        switch (quantidade_filtro) {
          case "maior_zero":
            return item.stock > 0;
          case "diferente_zero":
            return item.stock !== 0;
          case "igual_zero":
            return item.stock === 0;
          default:
            return true;
        }
      });
    }

    console.log("Resultados:", resultados.length);
    res.json(resultados);
  } catch (err) {
    console.error("Erro no relatório de stock:", err);
    res.status(500).send("Erro ao gerar relatório de stock: " + err.message);
  }
});

// Validacao comum para qualquer funcionalidade que consulte ficheiros guardados na Upload.
async function validarAcessoUploads(userId) {
  if (!isPositiveInt(userId)) {
    return { ok: false, status: 400, error: "userId obrigatorio" };
  }

  const resultUser = await pool.request().input("userId", sql.Int, userId)
    .query(`
      SELECT perfil_id, ISNULL(aceitou_termos, 0) AS aceitou_termos
      FROM Utilizador
      WHERE codigo = @userId
    `);

  if (!resultUser.recordset.length) {
    return { ok: false, status: 403, error: "Utilizador invalido" };
  }

  if (Number(resultUser.recordset[0].aceitou_termos) !== 1) {
    return { ok: false, status: 403, error: "Acesso negado aos ficheiros" };
  }

  return { ok: true, perfilId: resultUser.recordset[0].perfil_id };
}

function podeConsultarTodosUploads(perfilId) {
  return [PERFIL_GERENTE, PERFIL_ADMIN].includes(Number(perfilId));
}

function podeApagarUploads(perfilId) {
  return [PERFIL_GERENTE, PERFIL_ADMIN].includes(Number(perfilId));
}

//listar uploads que podem ser analisados para relatório
app.get("/relatorios/uploads", async (req, res) => {
  const userId = toInt(req.query.userId);

  try {
    await poolConexao;

    const acesso = await validarAcessoUploads(userId);
    if (!acesso.ok) {
      return res.status(acesso.status).json({ error: acesso.error });
    }

    const request = pool.request();
    let filtroUploads = "";

    if (!podeConsultarTodosUploads(acesso.perfilId)) {
      request.input("userId", sql.Int, userId);
      filtroUploads = `
        WHERE EXISTS (
          SELECT 1
          FROM MovimentosPDF mp
          WHERE mp.pdf_id = up.id
            AND mp.utilizador_id = @userId
            AND mp.tipo_movimento = 'entrada-pdf'
        )
      `;
    }

    const result = await request.query(`
      SELECT
        up.id,
        up.nome,
        up.tipo,
        up.Tamanho,
        up.DataUpload,
        SUBSTRING(up.PDF, 1, 16) AS assinatura
      FROM Upload up
      ${filtroUploads}
      ORDER BY up.DataUpload DESC
    `);

    const ficheiros = result.recordset.map((upload) => {
      const tipoRelatorio = detetarTipoRelatorioUpload({
        ...upload,
        PDF: upload.assinatura,
      });

      delete upload.assinatura;

      return {
        ...upload,
        tipo_relatorio: tipoRelatorio,
      };
    });

    res.json(ficheiros);
  } catch (err) {
    console.error("Erro ao listar ficheiros para relatorio:", err);
    res.status(500).json({ error: "Erro ao listar ficheiros para relatorio" });
  }
});

// gera relatório para um upload específico a partir do buffer guardado
app.get("/relatorios/uploads/:id", async (req, res) => {
  const userId = toInt(req.query.userId);
  const uploadId = toInt(req.params.id);

  if (!isPositiveInt(uploadId)) {
    return res.status(400).json({ error: "ID do ficheiro invalido" });
  }

  try {
    await poolConexao;

    const acesso = await validarAcessoUploads(userId);
    if (!acesso.ok) {
      return res.status(acesso.status).json({ error: acesso.error });
    }

    const request = pool.request().input("id", sql.Int, uploadId);
    let filtroUploads = "WHERE up.id = @id";

    if (!podeConsultarTodosUploads(acesso.perfilId)) {
      request.input("userId", sql.Int, userId);
      filtroUploads += `
        AND EXISTS (
          SELECT 1
          FROM MovimentosPDF mp
          WHERE mp.pdf_id = up.id
            AND mp.utilizador_id = @userId
            AND mp.tipo_movimento = 'entrada-pdf'
        )
      `;
    }

    const result = await request.query(`
      SELECT up.id, up.nome, up.tipo, up.Tamanho, up.DataUpload, up.PDF
      FROM Upload up
      ${filtroUploads}
    `);

    const upload = result.recordset[0];

    if (!upload) {
      return res
        .status(404)
        .json({ error: "Ficheiro não encontrado ou sem permissao" });
    }

    const relatorio = await gerarRelatorioUpload(upload);

    res.json({
      arquivo: {
        id: upload.id,
        nome: upload.nome,
        tipo: upload.tipo,
        tamanho: upload.Tamanho,
        data_upload: upload.DataUpload,
      },
      ...relatorio,
      gerado_em: new Date(),
    });
  } catch (err) {
    console.error("Erro ao gerar relatorio do ficheiro:", err);

    res.status(500).json({ error: "Erro ao gerar relatorio do ficheiro" });
  }
});

//listar todos os PDFs guardados (depois de verificar termos)
app.get("/pdfs", async (req, res) => {
  const userId = toInt(req.query.userId);

  try {
    await poolConexao;

    const acesso = await validarAcessoUploads(userId);
    if (!acesso.ok) {
      return res.status(acesso.status).json({ error: acesso.error });
    }

    const pdfs = await pool.request().query(`
      SELECT id, nome, tipo, Tamanho, DataUpload FROM Upload
    `);

    return res.json(pdfs.recordset);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro PDFs" });
  }
});

//listar movimentos relacionados com PDFs (entrada/saída)
app.get("/movimentos-pdf", async (req, res) => {
  try {
    await poolConexao;

    const result = await pool.request().query(`
      SELECT
        mp.id,
        u.nome AS utilizador,
        mp.nome_pdf,
        mp.tipo_movimento,
        FORMAT(mp.data_movimento, 'dd/MM/yyyy HH:mm:ss') AS data
      FROM MovimentosPDF mp
      INNER JOIN Utilizador u ON mp.utilizador_id = u.codigo
      WHERE mp.tipo_movimento IN ('entrada-pdf', 'saida-pdf')
      ORDER BY mp.data_movimento DESC
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Erro ao listar movimentos pdf:", err);
    res.status(500).send("Erro ao listar movimentos pdf");
  }
});

//listar histórico de visualizações de PDFs
app.get("/pdf-visualizacoes", async (req, res) => {
  const userId = toInt(req.query.userId);

  if (!isPositiveInt(userId)) {
    return res.status(400).json({ error: "userId obrigatorio" });
  }

  try {
    await poolConexao;

    const utilizador = await pool.request().input("userId", sql.Int, userId)
      .query(`
        SELECT codigo
        FROM Utilizador
        WHERE codigo = @userId
      `);

    if (!utilizador.recordset.length) {
      return res.status(404).json({ error: "Utilizador nao encontrado" });
    }

    const visualizacoes = await pool.request().query(`
      SELECT
        pv.id,
        pv.data_visualizacao,
        u.nome AS utilizador_nome,
        up.nome AS pdf_nome
      FROM PDF_Visualizacoes pv
      INNER JOIN Utilizador u ON pv.utilizador_id = u.codigo
      INNER JOIN Upload up ON pv.pdf_id = up.id
      ORDER BY pv.data_visualizacao DESC
    `);

    res.json(visualizacoes.recordset);
  } catch (err) {
    console.error("Erro ao listar visualizacoes de PDF:", err);
    res.status(500).json({ error: "Erro ao listar visualizacoes" });
  }
});

//ver/baixar um PDF (regista visualização e verifica permissões)
app.get("/pdf/:id", async (req, res) => {
  const pdfId = toInt(req.params.id);
  const userId = toInt(req.query.userId);

  if (!isPositiveInt(pdfId)) {
    return res.status(400).send("PDF invalido");
  }

  try {
    await poolConexao;

    const acesso = await validarAcessoUploads(userId);
    if (!acesso.ok) {
      return res.status(acesso.status).json({ error: acesso.error });
    }

    const request = pool.request().input("id", sql.Int, pdfId);
    let filtro = "WHERE up.id = @id";

    if (!podeConsultarTodosUploads(acesso.perfilId)) {
      request.input("userId", sql.Int, userId);
      filtro += `
        AND EXISTS (
          SELECT 1
          FROM MovimentosPDF mp
          WHERE mp.pdf_id = up.id
            AND mp.utilizador_id = @userId
            AND mp.tipo_movimento = 'entrada-pdf'
        )
      `;
    }

    const result = await request.query(`
      SELECT up.id, up.nome, up.tipo, up.PDF
      FROM Upload up
      ${filtro}
    `);

    const pdf = result.recordset[0];

    if (!pdf) {
      return res.status(404).send("PDF não econtrado");
    }

    await pool
      .request()
      .input("pdf_id", sql.Int, pdfId)
      .input("utilizador_id", sql.Int, userId).query(`
        INSERT INTO PDF_Visualizacoes (pdf_id, utilizador_id, data_visualizacao)
        VALUES (@pdf_id, @utilizador_id, GETDATE())
      `);

    res.setHeader("Content-Type", pdf.tipo || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${pdf.nome}"`);
    res.send(pdf.PDF);
  } catch (err) {
    console.error("Erro ao abrir PDF:", err);
    res.status(500).send("Erro PDF");
  }
});

//apagar um PDF e os seus movimentos/visualizações (restrito a gerente/admin)
app.delete("/pdf/:id", async (req, res) => {
  const transaction = new sql.Transaction(pool);
  let transactionStarted = false;

  try {
    const pdfId = toInt(req.params.id);
    const userId = toInt(req.body.userId);

    if (!isPositiveInt(pdfId)) {
      return res.status(400).send("PDF invalido");
    }

    if (!isPositiveInt(userId)) {
      return res.status(400).send("userId obrigatorio");
    }

    await poolConexao;

    const acesso = await validarAcessoUploads(userId);
    if (!acesso.ok) {
      return res.status(acesso.status).json({ error: acesso.error });
    }

    if (!podeApagarUploads(acesso.perfilId)) {
      return res
        .status(403)
        .json({ error: "Apenas gerentes e administradores podem apagar PDFs" });
    }

    await transaction.begin();
    transactionStarted = true;

    const request = new sql.Request(transaction);

    const pdfResult = await request.input("id", sql.Int, pdfId).query(`
        SELECT id, nome
        FROM Upload
        WHERE id = @id
      `);

    const pdf = pdfResult.recordset[0];

    if (!pdf) {
      await transaction.rollback();
      return res.status(404).send("PDF nao encontrado");
    }

    await new sql.Request(transaction).input("pdf_id", sql.Int, pdf.id).query(`
      DELETE FROM PDF_Visualizacoes
      WHERE pdf_id = @pdf_id
    `);

    await new sql.Request(transaction).input("pdf_id", sql.Int, pdf.id).query(`
      DELETE FROM MovimentosPDF
      WHERE pdf_id = @pdf_id
    `);

    const result = await new sql.Request(transaction)
      .input("id", sql.Int, pdfId)
      .query(`DELETE FROM Upload WHERE id = @id`);

    if (result.rowsAffected[0] === 0) {
      await transaction.rollback();
      return res.status(404).send("PDF nao encontrado");
    }

    await transaction.commit();
    res.json({ ok: true, message: "PDF apagado com sucesso" });
  } catch (err) {
    if (transactionStarted && transaction._aborted !== true) {
      await transaction.rollback().catch(() => {});
    }
    console.error("Erro ao apagar PDF:", err);
    res.status(500).send("Erro apagar PDF");
  }
});

// enviar/atualizar ficha pessoal do utilizador (cria/atualiza FichaPessoal)
app.post("/EnviarFicha", async (req, res) => {
  try {
    const d = req.body;
    if (!d.userCode) {
      return res.status(400).json({
        message: "userCode inválido.",
      });
    }

    //numero empregado
    const numeroEmpregado = Number(d.numeroEmpregado);

    if (!numeroEmpregado) {
      return res.status(400).json({
        message: "Número empregado inválido.",
      });
    }

    await poolConexao;

    const numeroExiste = await pool
      .request()
      .input("numeroEmpregado", sql.Int, numeroEmpregado)
      .input("userCode", sql.Int, d.userCode).query(`

        SELECT TOP 1 id
        FROM FichaPessoal
        WHERE
          numero_empregado =
            @numeroEmpregado
          AND utilizador_codigo !=
            @userCode
      `);

    if (numeroExiste.recordset.length > 0) {
      return res.status(400).json({
        message: "Número empregado já associado a outro utilizador.",
      });
    }
    //verifica se existe ficha
    const checkResult = await pool
      .request()
      .input("userCode", sql.Int, d.userCode).query(`

        SELECT TOP 1 id
        FROM FichaPessoal
        WHERE utilizador_codigo =
          @userCode

      `);

    const existe = checkResult.recordset.length > 0;

    const request = pool
      .request()
      .input("userCode", sql.Int, d.userCode)
      .input("numeroEmpregado", sql.Int, numeroEmpregado)
      .input("nome", sql.NVarChar, d.nome || "")
      .input("cc", sql.NVarChar, d.cc || "")
      .input("dataNascimento", sql.Date, d.dataNascimento || null)
      .input("estadoCivil", sql.NVarChar, d.estadoCivil || "")
      .input("habilitacoes", sql.NVarChar, d.habilitacoes || "")
      .input("numeroB", sql.NVarChar, d.numeroB || "")
      .input("nif", sql.NVarChar, d.nif || "")
      .input("titulares", sql.Int, d.titulares || 0)
      .input("dependentes", sql.Int, d.dependentes || 0)
      .input("tipoContrato", sql.NVarChar, d.tipoContrato || "")
      .input("profissao", sql.NVarChar, d.profissao || "")
      .input("salario", sql.Decimal(10, 2), d.salario || 0)
      .input("morada", sql.NVarChar, d.morada || "")
      .input("naturalidade", sql.NVarChar, d.naturalidade || "")
      .input("freguesia", sql.NVarChar, d.freguesia || "")
      .input("concelho", sql.NVarChar, d.concelho || "")
      .input("distrito", sql.NVarChar, d.distrito || "")
      .input("codigoP", sql.NVarChar, d.codigoP || "")
      .input("telefone", sql.NVarChar, d.telefone || "")
      .input("email", sql.NVarChar, d.email || "");

    //atualiza ficha
    if (existe) {
      await request.query(`
        UPDATE FichaPessoal SET
          numero_empregado =
            @numeroEmpregado,
          nome = @nome,
          numero_cc = @cc,
          data_nascimento =
            @dataNascimento,
          estado_civil =
            @estadoCivil,
          habilitacoes =
            @habilitacoes,
          numero_beneficiario =
            @numeroB,
          numero_contribuinte =
            @nif,
          numero_titulares =
            @titulares,
          numero_dependentes =
            @dependentes,
          tipo_contrato =
            @tipoContrato,
          profissao =
            @profissao,
          salario =
            @salario,
          morada =
            @morada,
          naturalidade =
            @naturalidade,
          freguesia =
            @freguesia,
          concelho =
            @concelho,
          distrito =
            @distrito,
          codigo_postal =
            @codigoP,
          telefone =
            @telefone,
          email =
            @email
        WHERE utilizador_codigo =
          @userCode
      `);

      const importacao = await reimportarRegistosFuncionarioGuardados();

      return res.json({
        message: "Ficha atualizada com sucesso!",
        importacao_registos: importacao,
      });
    }

    await request.query(`
      INSERT INTO FichaPessoal (
        utilizador_codigo,
        numero_empregado,
        nome,
        numero_cc,
        data_nascimento,
        estado_civil,
        habilitacoes,
        numero_beneficiario,
        numero_contribuinte,
        numero_titulares,
        numero_dependentes,
        tipo_contrato,
        profissao,
        salario,
        morada,
        naturalidade,
        freguesia,
        concelho,
        distrito,
        codigo_postal,
        telefone,
        email
      )

      VALUES (
        @userCode,
        @numeroEmpregado,
        @nome,
        @cc,
        @dataNascimento,
        @estadoCivil,
        @habilitacoes,
        @numeroB,
        @nif,
        @titulares,
        @dependentes,
        @tipoContrato,
        @profissao,
        @salario,
        @morada,
        @naturalidade,
        @freguesia,
        @concelho,
        @distrito,
        @codigoP,
        @telefone,
        @email
      )
    `);

    const importacao = await reimportarRegistosFuncionarioGuardados();

    return res.json({
      message: "Ficha criada com sucesso!",
      importacao_registos: importacao,
    });
  } catch (err) {
    console.error("Erro SQL:", err);

    return res.status(500).json({
      message: "Erro ao guardar ficha.",
    });
  }
});

//carregar ficha pessoal por userId
app.get("/Ficha/:userId", async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        message: "userId inválido",
      });
    }

    await poolConexao;

    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT 
          utilizador_codigo,
          numero_empregado,
          nome,
          numero_cc,
          data_nascimento,
          estado_civil,
          habilitacoes,
          numero_beneficiario,
          numero_contribuinte,
          numero_titulares,
          numero_dependentes,
          tipo_contrato,
          profissao,
          salario,
          morada,
          naturalidade,
          freguesia,
          concelho,
          distrito,
          codigo_postal,
          telefone,
          email
        FROM FichaPessoal
        WHERE utilizador_codigo = @userId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        message: "Sem ficha",
      });
    }

    const ficha = result.recordset[0];

    return res.json({
      utilizador_codigo: ficha.utilizador_codigo,
      numero_empregado: ficha.numero_empregado,
      nome: ficha.nome,
      numero_cc: ficha.numero_cc,
      data_nascimento: ficha.data_nascimento,
      estado_civil: ficha.estado_civil,
      habilitacoes: ficha.habilitacoes,
      numero_beneficiario: ficha.numero_beneficiario,
      numero_contribuinte: ficha.numero_contribuinte,
      numero_titulares: ficha.numero_titulares,
      numero_dependentes: ficha.numero_dependentes,
      tipo_contrato: ficha.tipo_contrato,
      profissao: ficha.profissao,
      salario: ficha.salario,
      morada: ficha.morada,
      naturalidade: ficha.naturalidade,
      freguesia: ficha.freguesia,
      concelho: ficha.concelho,
      distrito: ficha.distrito,
      codigo_postal: ficha.codigo_postal,
      telefone: ficha.telefone,
      email: ficha.email,
    });
  } catch (err) {
    console.error("Erro ao buscar ficha:", err);

    return res.status(500).json({
      message: "Erro ao buscar ficha",
    });
  }
});

app.get("/horasFuncionario/:userId", async (req, res) => {
  const userId = toInt(req.params.userId);

  if (!isPositiveInt(userId)) {
    return res.status(400).json({
      error: "userId invalido",
    });
  }

  try {
    await poolConexao;

    const result = await pool.request().input("userId", sql.Int, userId).query(`
        SELECT id, utilizador_id, data, total_horas, data_importacao
        FROM RegistoFuncionario
        WHERE utilizador_id = @userId
        ORDER BY data DESC
      `);

    return res.json({
      sucesso: true,
      dados: result.recordset,
    });
  } catch (err) {
    console.log("Erro na BD:", err);

    return res.status(500).json({
      error: "Erro ao buscar dados do funcionário",
    });
  }
});

app.listen(3000, () => {
  console.log("Servidor a correr na porta 3000");
});
