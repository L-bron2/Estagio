const api = `${baseAPI}/horasFuncionario`;

let registros = [];
let paginaAtual = 1;
const porPagina = 12;

// carregar registro mensagem
function atualizarEstadoRegistros(mensagem = "") {
  const estado = document.getElementById("estado-registros");
  if (estado) {
    estado.textContent = mensagem;
    estado.style.display = mensagem ? "block" : "none";
  }
}

// fromatar datas
function formatarData(valor, incluirHora = false) {
  if (!valor) return "-";

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "-";

  return incluirHora
    ? data.toLocaleString("pt-PT")
    : data.toLocaleDateString("pt-PT");
}

// horas com 2 casa decimais
function formatarHoras(valor) {
  const horas = Number(valor);
  return Number.isNaN(horas) ? "-" : horas.toFixed(2);
}

// carrega o registro do utilizador
async function carregarRegistros() {
  const userId = sessionStorage.getItem("userId");

  if (!userId) {
    window.location.href = "../login/login.html";
    return;
  }

  atualizarEstadoRegistros("A carregar registos...");

  try {
    await comLoader(async () => {
      const response = await fetch(`${api}/${userId}`);

      if (!response.ok) {
        throw new Error("Erro ao buscar registos");
      }

      const data = await response.json();

      registros = Array.isArray(data.dados) ? data.dados : [];
      paginaAtual = 1;
      renderTabela();
    });
  } catch (err) {
    console.error("Erro ao carregar dados:", err);
    atualizarEstadoRegistros("Erro ao carregar registos.");
  }
}


function renderTabela() {
  const tbody = document.getElementById("tabelaRegistro");
  const paginaInfo = document.getElementById("pagina-info");

  tbody.innerHTML = "";

  const totalPaginas = Math.ceil(registros.length / porPagina) || 1;

  if (paginaAtual > totalPaginas) {
    paginaAtual = totalPaginas;
  }

  if (!registros.length) {
    atualizarEstadoRegistros("Nenhum registo encontrado.");
    tbody.innerHTML = `<tr><td colspan="5">Ainda sem nehum registo.</td></tr>`;
    paginaInfo.innerText = "Página 1 de 1";
    return;
  }

  atualizarEstadoRegistros("");

  const inicio = (paginaAtual - 1) * porPagina;
  const pagina = registros.slice(inicio, inicio + porPagina);

  pagina.forEach((registro) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${registro.id}</td>
      <td>${registro.utilizador_id}</td>
      <td>${formatarData(registro.data)}</td>
      <td>${formatarHoras(registro.total_horas)}</td>
      <td>${formatarData(registro.data_importacao, true)}</td>
    `;

    tbody.appendChild(tr);
  });

  paginaInfo.innerText = `Página ${paginaAtual} de ${totalPaginas}`;
}


//paginação
function proximaPagina() {
  const totalPaginas = Math.ceil(registros.length / porPagina) || 1;

  if (paginaAtual < totalPaginas) {
    paginaAtual++;
    renderTabela();
  }
}

function paginaAnterior() {
  if (paginaAtual > 1) {
    paginaAtual--;
    renderTabela();
  }
}

window.onload = () => {
  protegerComPermissao("meuRegistro");
  carregarRegistros();
};
