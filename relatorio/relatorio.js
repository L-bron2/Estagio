// Carrega os armazens do filtro de stock.
async function carregarArmazens() {
  await comLoader(async () => {
    try {
      const response = await fetch(`${baseAPI}/armazens`);
      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status}`);
      }

      const armazens = await response.json();
      const selectArmazem = document.getElementById("armazem");

      while (selectArmazem.options.length > 1) {
        selectArmazem.remove(1);
      }

      armazens.forEach((armazem) => {
        const option = document.createElement("option");
        option.value = armazem.codigo;
        option.textContent = armazem.descricao;
        selectArmazem.appendChild(option);
      });
    } catch (error) {
      console.error("Erro ao carregar armazens:", error);
      alert("Erro ao carregar armazens: " + error.message, "erro");
    }
  });
}

// Filtrar stock.
document.getElementById("filtrar-btn").addEventListener("click", async () => {
  const armazemId = document.getElementById("armazem").value;
  const produtoNome = document.getElementById("Prod-name").value.trim();
  const quantidadeFiltro = document.getElementById("quantidade-filtro").value;

  await comLoader(async () => {
    try {
      const params = new URLSearchParams();
      if (armazemId) params.append("armazem_id", armazemId);
      if (produtoNome) params.append("produto_nome", produtoNome);
      if (quantidadeFiltro) params.append("quantidade_filtro", quantidadeFiltro);

      const response = await fetch(`${baseAPI}/relatorios/stock?${params}`);
      if (!response.ok) {
        throw new Error(`Erro HTTP: ${response.status} - ${response.statusText}`);
      }

      const dados = await response.json();
      exibirDadosStock(dados);
    } catch (error) {
      console.error("Erro ao filtrar stock:", error);
      alert("Erro ao carregar dados do relatório: " + error.message);
    }
  });
});

function exibirDadosStock(dados) {
  const tbody = document.getElementById("tabela-relatorio");
  tbody.innerHTML = "";

  if (dados.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="5" style="text-align: center;">Nenhum dado encontrado</td>';
    tbody.appendChild(tr);
    return;
  }

  dados.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.id}</td>
      <td>${item.nome}</td>
      <td>${item.armazem_nome || "Todos"}</td>
      <td>${item.fornecedor}</td>
      <td>${item.stock}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  protegerComPermissao("relatorio");
  await carregarArmazens();
});
