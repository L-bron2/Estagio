let contagens = [];
let paginaAtual = 1;
const porPagina = 10;

// CARREGAR CONTAGENS
async function carregarContagens() {
  const armazem_id = sessionStorage.getItem("armazem_id");

  if (!armazem_id) {
    alert("Armazém não identificado", "aviso");
    return;
  }

  await comLoader(async () => {
    try {
      const response = await fetch(
        `${baseAPI}/contagem?armazem_id=${armazem_id}`,
      );
      const data = await response.json();
      contagens = data;
      mostrarContagens();
    } catch (err) {
      console.error("Erro ao carregar contagens:", err);
      alert("Erro ao carregar contagens", "erro");
    }
  });
}

//normalizar maiusculas, minusculas e acentos
function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// PESQUISA
function setupPesquisa() {
  const pesquisaInput = document.getElementById("pesquisa");
  if (pesquisaInput) {
    pesquisaInput.addEventListener("input", () => {
      paginaAtual = 1;
      mostrarContagens();
    });
  }
}

// MOSTRAR TABELA
function mostrarContagens() {
  const tabela = document.getElementById("tabela-contagem");
  tabela.innerHTML = "";

  const termoPesquisa = document.getElementById("pesquisa").value.toLowerCase();
  const termoNormalizado = normalizarTexto(termoPesquisa);

  const filtrados = contagens.filter((c) =>
    normalizarTexto(c.nome).includes(termoNormalizado),
  );

  const totalPaginas = Math.ceil(filtrados.length / porPagina) || 1;

  if (paginaAtual > totalPaginas) {
    paginaAtual = totalPaginas;
  }

  const inicio = (paginaAtual - 1) * porPagina;
  const pagina = filtrados.slice(inicio, inicio + porPagina);

  pagina.forEach((c) => {
    const tr = document.createElement("tr");

    const dataFormatada = new Date(c.data_contagem).toLocaleString("pt-PT");

    tr.innerHTML = `
      <td>${c.id}</td>
      <td>${c.nome}</td>
      <td>${c.quantidade}</td>
      <td>${c.armazem_nome || "---"}</td>
      <td>${dataFormatada}</td>
    `;

    tabela.appendChild(tr);
  });

  document.getElementById("pagina-info").innerText =
    `Página ${paginaAtual} de ${totalPaginas}`;
}

// PAGINAÇÃO
function proximaPagina() {
  paginaAtual++;
  mostrarContagens();
}

function paginaAnterior() {
  if (paginaAtual > 1) {
    paginaAtual--;
    mostrarContagens();
  }
}

window.onload = () => {
  protegerComPermissao("contagem");

  const armazemInput = document.getElementById("armazem_id");
  if (armazemInput && !armazemInput.value) {
    armazemInput.value = sessionStorage.getItem("armazem_id") || "";
  }

  setupPesquisa();
  carregarContagens();
};
