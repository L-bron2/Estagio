const apiMovimentos = `${baseAPI}/movimentos`;

let movimentos = [];
let paginaAtual = 1;
const porPagina = 10;

// CARREGAR MOVIMENTOS
async function carregarMovimentos() {
  await comLoader(async () => {
    try {
      const response = await fetch(apiMovimentos);

      if (!response.ok) {
        throw new Error("Erro ao buscar movimentos");
      }

      movimentos = await response.json();

      mostrarMovimentos();
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
      mostrarMovimentos();
    });
  }
}

// MOSTRAR MOVIMENTOS
function mostrarMovimentos() {
  const tabela = document.getElementById("tabela-movimentos");
  tabela.innerHTML = "";

  const termoPesquisa = document.getElementById("pesquisa").value.toLowerCase();
  const termoNormalizado = normalizarTexto(termoPesquisa);

  const filtrados = movimentos.filter(
    (m) =>
      normalizarTexto(m.nome).includes(termoNormalizado) ||
      normalizarTexto(m.utilizador).includes(termoNormalizado) ||
      normalizarTexto(m.armazem).includes(termoNormalizado) ||
      normalizarTexto(m.tipo_movimento).includes(termoNormalizado) ||
      ((m.tipo_movimento === "transferencia_saida" ||
        m.tipo_movimento === "transferencia_entrada") &&
        "transferencia".includes(termoNormalizado)),
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
    if (
      m.tipo_movimento === "entrada" ||
      m.tipo_movimento === "transferencia_entrada"
    ) {
      tr.classList.add("entrada");
    } else if (m.tipo_movimento === "consumo") {
      tr.classList.add("consumo");
    } else if (
      m.tipo_movimento === "saida" ||
      m.tipo_movimento === "transferencia_saida"
    ) {
      tr.classList.add("saida");
    }

    tr.innerHTML = `
      <td>${m.id}</td>
      <td>${m.utilizador}</td>
      <td>${m.nome}</td>
      <td>${m.tipo_movimento.replace("transferencia_", "transferência ")}</td>
      <td>${m.armazem}</td>
      <td>${m.quantidade}</td>  
      <td>${m.data}</td>  
    `;

    tabela.appendChild(tr);
  });

  document.getElementById("pagina-info").innerText =
    `Página ${paginaAtual} de ${totalPaginas}`;
}

// PAGINAÇÃO
function proximaPagina() {
  paginaAtual++;
  mostrarMovimentos();
}

function paginaAnterior() {
  if (paginaAtual > 1) {
    paginaAtual--;
    mostrarMovimentos();
  }
}

//normalizar maiusculas, minusculas e acentos
function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

window.onload = async () => {
  protegerComPermissao("movimentos");
  setupPesquisa();
  await carregarMovimentos();
};
