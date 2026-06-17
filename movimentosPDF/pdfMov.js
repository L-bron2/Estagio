const apiMovimentosPDF = `${baseAPI}/movimentos-pdf`;

let movimentosPDF = [];
let paginaAtual = 1;
const porPagina = 10;

// CARREGAR MOVIMENTOS PDF
async function carregarMovimentosPDF() {
  await comLoader(async () => {
    try {
      const response = await fetch(apiMovimentosPDF);

      if (!response.ok) {
        throw new Error("Erro ao buscar movimentos pdf");
      }

      movimentosPDF = await response.json();
      mostrarMovimentosPDF();
    } catch (err) {
      console.error("Erro:", err);
    }
  });
}

// SETUP PESQUISA
function setupPesquisa() {
  const pesquisaInput = document.getElementById("pesquisa");
  if (pesquisaInput) {
    pesquisaInput.addEventListener("input", () => {
      paginaAtual = 1;
      mostrarMovimentosPDF();
    });
  }
}

// MOSTRAR MOVIMENTOS PDF
function mostrarMovimentosPDF() {
  const tabela = document.getElementById("tabela-movimentos");
  tabela.innerHTML = "";

  const termoPesquisa = document.getElementById("pesquisa").value.toLowerCase();
  const termoNormalizado = normalizarTexto(termoPesquisa);

  const filtrados = movimentosPDF.filter(
    (m) =>
      normalizarTexto(m.nome_pdf).includes(termoNormalizado) ||
      normalizarTexto(m.utilizador).includes(termoNormalizado) ||
      normalizarTexto(m.tipo_movimento).includes(termoNormalizado),
  );

  const totalPaginas = Math.ceil(filtrados.length / porPagina) || 1;

  if (paginaAtual > totalPaginas) {
    paginaAtual = totalPaginas;
  }

  const inicio = (paginaAtual - 1) * porPagina;
  const pagina = filtrados.slice(inicio, inicio + porPagina);

  pagina.forEach((m) => {
    const tr = document.createElement("tr");

    // cor por tipo
    if (m.tipo_movimento === "entrada-pdf") {
      tr.classList.add("entrada-pdf");
    } else if (m.tipo_movimento === "saida-pdf") {
      tr.classList.add("saida-pdf");
    }

    tr.innerHTML = `
      <td>${m.id}</td>
      <td>${m.utilizador}</td>
      <td>${m.nome_pdf}</td>
      <td>${m.tipo_movimento}</td>
      <td>${m.data}</td>
    `;

    tabela.appendChild(tr);
  });

  document.getElementById("pagina-info").innerText =`Página ${paginaAtual} de ${totalPaginas}`;
}

// PAGINACAO
function proximaPagina() {
  paginaAtual++;
  mostrarMovimentosPDF();
}

function paginaAnterior() {
  if (paginaAtual > 1) {
    paginaAtual--;
    mostrarMovimentosPDF();
  }
}

// normalizar texto
function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

window.onload = async () => {
  protegerComPermissao("pdfMovimento");
  setupPesquisa();
  await carregarMovimentosPDF();
};
