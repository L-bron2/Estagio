let consumos = [];

// LISTAR CONSUMOS
async function listarConsumos() {
  await comLoader(async () => {
    try {
      const response = await fetch(`${baseAPI}/consumo`);
      consumos = await response.json();

      renderTabela(consumos);
    } catch (err) {
      console.error("Erro:", err);
    }
  });
}

//TABELA
function renderTabela(lista) {
  const tbody = document.getElementById("tabela-consumo");
  tbody.innerHTML = "";

  // Verificar se o usuário pode apagar consumos (apenas gerentes e admins)
  const perfilId = parseInt(sessionStorage.getItem("perfil_id"));
  const podeApagar = perfilId === 5 || perfilId === 6;

  lista.forEach((p) => {
    const tr = document.createElement("tr");

    const botaoApagar = podeApagar
      ? `
        <button onclick="apagarConsumo(${p.id})">
            <span class="material-symbols-outlined">delete</span>
        </button>`
      : "";

    tr.innerHTML = `
        <td class="id">${p.id}</td>
        <td class="campo-nome">${p.nome}</td>
        <td class="stock">${p.total_consumido}</td>
        <td class="data">${p.data}</td>
        <td>${botaoApagar}</td>
        `;

    tbody.appendChild(tr);
  });
}

// PESQUISA
function setupPesquisa() {
  const pesquisaInput = document.getElementById("pesquisa");
  if (pesquisaInput) {
    pesquisaInput.addEventListener("input", (e) => {
      const termoPesquisa = e.target.value.toLowerCase();
      const termoNormalizado = normalizarTexto(termoPesquisa);

      const filtrados = consumos.filter((p) =>
        normalizarTexto(p.nome).includes(termoNormalizado),
      );

      renderTabela(filtrados);
    });
  }
}

//normalizar maiusculas, minusculas e acentos
function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// APAGAR CONSUMO
async function apagarConsumo(id) {
  const confirmar = confirm("Tens a certeza?");
  if (!confirmar) return;

  const userId = sessionStorage.getItem("userId");

  try {
    await comLoader(async () => {
      const response = await fetch(`${baseAPI}/consumivel/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: parseInt(userId) }),
      });

      if (response.ok) {
        await listarConsumos();
      } else {
        const errorData = await response.json();
        alert("Erro: " + (errorData.message || "Erro ao apagar consumo"), "erro");
      }
    });
  } catch (err) {
    console.error(err);
    alert("Erro ao apagar consumo", "erro");
  }
}

window.onload = () => {
  protegerComPermissao("consumo");

  setupPesquisa();
  listarConsumos();
};
