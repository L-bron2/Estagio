function formatarData(data) {
  if (!data) {
    return "-";
  }

  return new Date(data).toLocaleString("pt-PT");
}

function formatarTamanho(bytes) {
  const valor = Number(bytes || 0);

  if (valor < 1024) {
    return `${valor} B`;
  }

  if (valor < 1024 * 1024) {
    return `${(valor / 1024).toFixed(1)} KB`;
  }

  return `${(valor / (1024 * 1024)).toFixed(2)} MB`;
}

function escaparHTML(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Carrega os ficheiros guardados para gerar relatorio
async function carregarFicheirosRelatorio() {
  const userId = sessionStorage.getItem("userId");
  const select = document.getElementById("ficheiro-relatorio");
  const estado = document.getElementById("estado-relatorio-ficheiro");

  select.innerHTML = '<option value="">-- Seleciona um ficheiro --</option>';

  await comLoader(async () => {
    try {
      const response = await fetch(
        `${baseAPI}/relatorios/uploads?userId=${userId}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao listar ficheiros");
      }

      if (!data.length) {
        estado.textContent =
          "Nao existem ficheiros disponiveis para analisar.";
        return;
      }

      data.forEach((ficheiro) => {
        const option = document.createElement("option");
        option.value = ficheiro.id;
        option.textContent = `${ficheiro.nome} (${ficheiro.tipo_relatorio.toUpperCase()})`;
        select.appendChild(option);
      });

      estado.textContent = "Seleciona um ficheiro para gerar o relatório.";
    } catch (error) {
      console.error("Erro ao carregar ficheiros de relatório:", error);
      estado.textContent = error.message;
    }
  });
}

function renderizarCartoesResumo(relatorio) {
  const container = document.getElementById("resumo-relatorio-ficheiro");
  const tipoRelatorio = relatorio.tipo_relatorio || "ficheiro";

  const cartoes = [
    { titulo: "Ficheiro", valor: relatorio.arquivo.nome },
    { titulo: "Tipo", valor: tipoRelatorio.toUpperCase() },
    {
      titulo: "Data upload",
      valor: formatarData(relatorio.arquivo.data_upload),
    },
    { titulo: "Tamanho", valor: formatarTamanho(relatorio.arquivo.tamanho) },
  ];

  if (tipoRelatorio === "excel") {
    cartoes.push(
      { titulo: "Folhas", valor: relatorio.total_folhas },
      { titulo: "Linhas", valor: relatorio.total_linhas },
      { titulo: "Max. colunas", valor: relatorio.total_colunas_max },
    );
  } else if (relatorio.total_linhas || relatorio.total_colunas) {
    cartoes.push(
      { titulo: "Linhas", valor: relatorio.total_linhas },
      { titulo: "Colunas", valor: relatorio.total_colunas },
    );
  }

  if (relatorio.delimitador) {
    cartoes.push({ titulo: "Delimitador", valor: relatorio.delimitador });
  }

  if (relatorio.total_paginas) {
    cartoes.push({ titulo: "Paginas", valor: relatorio.total_paginas });
  }

  if (relatorio.extensao) {
    cartoes.push({ titulo: "Extensao", valor: relatorio.extensao });
  }

  if (relatorio.tipo_mime) {
    cartoes.push({ titulo: "MIME", valor: relatorio.tipo_mime });
  }

  if (relatorio.erro_leitura) {
    cartoes.push({ titulo: "Aviso", valor: relatorio.erro_leitura });
  }

  container.innerHTML = cartoes
    .map(
      (cartao) => `
        <article class="resumo-card">
          <span>${escaparHTML(cartao.titulo)}</span>
          <strong>${escaparHTML(cartao.valor ?? "-")}</strong>
        </article>
      `,
    )
    .join("");
}

function criarTabelaPreview(cabecalho = [], linhas = [], linhasIncluemCabecalho = true) {
  const headers = cabecalho.length ? cabecalho : linhas[0] || [];
  const bodyRows =
    cabecalho.length && !linhasIncluemCabecalho ? linhas : linhas.slice(1);

  const thead = headers.length
    ? `
      <thead>
        <tr>${headers.map((coluna) => `<th>${escaparHTML(coluna || "-")}</th>`).join("")}</tr>
      </thead>
    `
    : "";

  const tbody = bodyRows.length
    ? `
      <tbody>
        ${bodyRows
          .map(
            (linha) => `
              <tr>${linha.map((coluna) => `<td>${escaparHTML(coluna || "-")}</td>`).join("")}</tr>
            `,
          )
          .join("")}
      </tbody>
    `
    : `
      <tbody>
        <tr><td>Nenhum dado para mostrar</td></tr>
      </tbody>
    `;

  return `
    <div class="preview-tabela-wrap">
      <table class="preview-tabela">
        ${thead}
        ${tbody}
      </table>
    </div>
  `;
}

function renderizarDetalhesRelatorio(relatorio) {
  const container = document.getElementById("detalhes-relatorio-ficheiro");

  if (relatorio.tipo_relatorio === "excel") {
    container.innerHTML = relatorio.folhas
      .map(
        (folha) => `
          <section class="detalhe-bloco">
            <div class="detalhe-header">
              <h3>Relatório: ${escaparHTML(folha.nome_folha)}</h3>
              <p>${escaparHTML(folha.total_linhas)} linhas | ${escaparHTML(folha.total_colunas)} colunas</p>
            </div>
            ${criarTabelaPreview(folha.cabecalho, folha.preview)}
          </section>
        `,
      )
      .join("");
    return;
  }

  if (Array.isArray(relatorio.preview)) {
    container.innerHTML = `
      <section class="detalhe-bloco">
        <div class="detalhe-header">
          <h3>Relatório: ${escaparHTML(relatorio.titulo_relatorio || "Conteudo")}</h3>
          <p>${escaparHTML(relatorio.total_linhas)} linhas | ${escaparHTML(relatorio.total_colunas)} colunas</p>
        </div>
        <p class="resumo-texto">${escaparHTML(relatorio.resumo_texto || "Sem resumo textual.")}</p>
        ${criarTabelaPreview(relatorio.cabecalho, relatorio.preview)}
      </section>
    `;
    return;
  }

  if (Array.isArray(relatorio.detalhes)) {
    container.innerHTML = `
      <section class="detalhe-bloco">
        <div class="detalhe-header">
          <h3>Relatório: Metadados</h3>
          <p>${escaparHTML(relatorio.resumo_texto || "Resumo do ficheiro")}</p>
        </div>
        ${criarTabelaPreview(["Campo", "Valor"], relatorio.detalhes, false)}
      </section>
    `;
    return;
  }

  container.innerHTML = `
    <section class="detalhe-bloco">
      <div class="detalhe-header">
        <h3>Relatório</h3>
      </div>
      <p class="resumo-texto">${escaparHTML(relatorio.resumo_texto || "Sem dados para mostrar.")}</p>
    </section>
  `;
}

//envia uma requisição ao servidor a pedir o relatorio
async function gerarRelatorioFicheiro() {
  const userId = sessionStorage.getItem("userId");
  const ficheiroId = document.getElementById("ficheiro-relatorio").value;
  const estado = document.getElementById("estado-relatorio-ficheiro");

  if (!ficheiroId) {
    estado.textContent = "Seleciona um ficheiro para gerar o relatório.";
    return;
  }

  await comLoader(async () => {
    try {
      estado.textContent = "A gerar relatório...";

      const response = await fetch(
        `${baseAPI}/relatorios/uploads/${ficheiroId}?userId=${userId}`,
      );
      const relatorio = await response.json();

      if (!response.ok) {
        throw new Error(relatorio.error || "Erro ao gerar relatório");
      }

      renderizarCartoesResumo(relatorio);
      renderizarDetalhesRelatorio(relatorio);
      estado.textContent = `Relatório gerado em ${formatarData(relatorio.gerado_em)}.`;
    } catch (error) {
      console.error("Erro ao gerar relatório do ficheiro:", error);
      estado.textContent = error.message;
      document.getElementById("resumo-relatorio-ficheiro").innerHTML = "";
      document.getElementById("detalhes-relatorio-ficheiro").innerHTML = "";
    }
  });
}

//download
document.getElementById("btnDownload").addEventListener("click", async () => {
  const ficheiroId = document.getElementById("ficheiro-relatorio").value;
  const userId = sessionStorage.getItem("userId");
  const estado = document.getElementById("estado-relatorio-ficheiro");

  if (!ficheiroId) {
    alert("Nenhum ficheiro selecionado. Seleciona um ficheiro.");
    return;
  }

  await comLoader(async () => {
    try {
      estado.textContent = "A preparar download...";

      const response = await fetch(
        `${baseAPI}/download-processado-pdf/${ficheiroId}?userId=${userId}`,
        {
          method: "GET",
        },
      );

      if (!response.ok) {
        let erro = "Erro ao fazer download. Tenta novamente mais tarde.";

        try {
          const errorData = await response.json();
          erro = errorData.error || erro;
        } catch {}

        throw new Error(erro);
      }

      // obter blob PDF
      const blob = await response.blob();

      // criar URL temporário
      const url = window.URL.createObjectURL(blob);

      // obter nome do ficheiro selecionado
      const select = document.getElementById("ficheiro-relatorio");
      const textoSelecionado = select.selectedOptions[0]?.text || "relatorio";

      const nomeFicheiro = textoSelecionado
        .split(" (")[0]
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");

      // criar link de download
      const a = document.createElement("a");
      a.href = url;
      a.download = `processado_${nomeFicheiro}.pdf`;

      document.body.appendChild(a);
      a.click();

      // limpeza
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        a.remove();
      }, 100);

      estado.textContent = "Download concluído.";
    } catch (error) {
      console.error("Erro no download:", error);
      estado.textContent =
        error.message || "Erro inesperado ao descarregar o ficheiro.";
    }
  });
});

document
  .getElementById("gerar-relatorio-ficheiro-btn")
  .addEventListener("click", gerarRelatorioFicheiro);

document.addEventListener("DOMContentLoaded", async () => {
  protegerComPermissao("Rmensal");
  await carregarFicheirosRelatorio();
});
