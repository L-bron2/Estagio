const listAPI = `${baseAPI}/produtos`;

let produtos = [];
let paginaAtual = 1;
const porPagina = 12;
const nomesTipoProduto = {
  prodVenda: "Produto para venda",
  prodConsumo: "Produto para consumo",
  prodBrinde: "Produto para brinde",
};

function nomeTipoProduto(tipoProd) {
  return nomesTipoProduto[tipoProd] || "-";
}

// CARREGAR PRODUTOS
async function carregarProdutos() {
  await comLoader(async () => {
    try {
      const armazem_id = sessionStorage.getItem("armazem_id");

      if (!armazem_id) {
        console.error("armazem_id não encontrado");
        return;
      }

      const response = await fetch(`${listAPI}?armazem_id=${armazem_id}`);
      if (!response.ok) throw new Error("Erro ao buscar produtos");

      produtos = await response.json();
      mostrarProdutos();
    } catch (err) {
      console.error(err);
    }
  });
}

// MOSTRAR PRODUTOS
function mostrarProdutos() {
  const tabela = document.getElementById("tabela-produtos");
  tabela.innerHTML = "";

  const termoPesquisa = document.getElementById("pesquisa").value.toLowerCase();
  const termoNormalizado = normalizarTexto(termoPesquisa);
  const filtroTipoProd = document.getElementById("filtroTipoProd")?.value || "";

  const filtrados = produtos.filter((p) => {
    const correspondePesquisa = normalizarTexto(p.nome).includes(
      termoNormalizado,
    );
    const correspondeTipo = !filtroTipoProd || p.tipoProd === filtroTipoProd;

    return correspondePesquisa && correspondeTipo;
  });

  const totalPaginas = Math.ceil(filtrados.length / porPagina) || 1;

  if (paginaAtual > totalPaginas) {
    paginaAtual = totalPaginas;
  }

  const inicio = (paginaAtual - 1) * porPagina;
  const pagina = filtrados.slice(inicio, inicio + porPagina);

  pagina.forEach((produto) => {
    const tr = document.createElement("tr");

    if (produto.stock <= 2) {
      tr.classList.add("baixo");
    }

    tr.innerHTML = `
      <td>${produto.id}</td>
      <td>${produto.nome}</td>
      <td>${nomeTipoProduto(produto.tipoProd)}</td>
      <td>${produto.fornecedor || "-"}</td>
      <td>${produto.armazem_nome || "-"}</td>
      <td>${produto.stock}</td>
      <td>
        <input type="number" id="add-${produto.id}" placeholder="Qtd" style="width:60px;">
        
        <button class="btnUpdateStock" onclick="atualizarTodosStocks(${produto.id}, event)">Adicionar</button>
        <button class="RemoveStock" onclick="removerStock(${produto.id}, event)">Remover</button>
  
      </td>

    `;

    tabela.appendChild(tr);
  });

  document.getElementById("pagina-info").innerText =
    `Página ${paginaAtual} de ${totalPaginas}`;

  // Atualizar nome do armazém se disponivel
  if (pagina.length > 0 && pagina[0].armazem_nome) {
    document.getElementById("armazem-nome").innerText = pagina[0].armazem_nome;
  }
}

// ATUALIZAR STOCKS
async function atualizarTodosStocks() {
  const userId = sessionStorage.getItem("userId");
  const armazem_id = sessionStorage.getItem("armazem_id");

  let atualizou = false;

  try {
    await comLoader(async () => {
      for (const produto of produtos) {
        const input = document.getElementById(`add-${produto.id}`);
        if (!input) continue;

        const quantidade = parseInt(input.value);

        if (quantidade && quantidade > 0) {
          atualizou = true;

          await fetch(`${baseAPI}/produtos/adicionar-stock`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              produto_id: produto.id,
              quantidade,
              utilizador_id: parseInt(userId),
              armazem_id: parseInt(armazem_id),
            }),
          });
        }
      }

      if (!atualizou) {
        alert("Nenhum valor inserido");
        return;
      }

      alert("Stock atualizado!");

      document
        .querySelectorAll("input[id^='add-']")
        .forEach((i) => (i.value = ""));

      await carregarProdutos();
    });
  } catch (err) {
    console.error(err);
    alert("Erro ao atualizar stocks");
  }
}

//remover stock
async function removerStock(id, event) {
  event.preventDefault();
  const userId = parseInt(sessionStorage.getItem("userId"), 10);
  const armazemId = parseInt(sessionStorage.getItem("armazem_id"), 10);

  if (!userId || !armazemId) {
    alert("Sessão expirada. Faça login novamente.");
    return;
  }

  const btn = event && event.target;
  if (btn) {
    btn.disabled = true;
    btn.innerText = "A processar...";
  }

  try {
    const res = await fetch(`${baseAPI}/produtos/remover-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        produto_id: id,
        quantidade: 1,
        armazem_id: armazemId,
        utilizador_id: userId,
      }),
    });

    if (res.ok) {
      alert("Stock atualizado!");
      await carregarProdutos();
    } else {
      alert("Erro ao remover stock");
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao remover stock");
  }
}

// PAGinaçãp
function proximaPagina() {
  paginaAtual++;
  mostrarProdutos();
}

function paginaAnterior() {
  if (paginaAtual > 1) {
    paginaAtual--;
    mostrarProdutos();
  }
}

//normalizar maiusculas, minusculas e acentos
function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

window.onload = () => {
  protegerComPermissao("produtos");

  const pesquisaInput = document.getElementById("pesquisa");
  if (pesquisaInput) {
    pesquisaInput.addEventListener("input", () => {
      paginaAtual = 1;
      mostrarProdutos();
    });
  }

  const filtroTipoProd = document.getElementById("filtroTipoProd");
  if (filtroTipoProd) {
    filtroTipoProd.addEventListener("change", () => {
      paginaAtual = 1;
      mostrarProdutos();
    });
  }

  const formProduto = document.getElementById("form-produto");
  if (formProduto) {
    formProduto.addEventListener("submit", async (e) => {
      e.preventDefault();

      const nome = document.getElementById("nome").value.trim();
      const stock = document.getElementById("stock").value;
      const fornecedor = document.getElementById("fornecedor").value.trim();
      const tipoProd = document.getElementById("tipoProd").value;

      const userId = sessionStorage.getItem("userId");
      const armazem_id = sessionStorage.getItem("armazem_id");

      if (!armazem_id) {
        alert("Sessão expirada. Faça login novamente.", "aviso");
        return;
      }
      if (!tipoProd) {
        alert("Escolha o tipo de produto", "aviso");
        return;
      }

      try {
        await comLoader(async () => {
          const response = await fetch(listAPI, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              nome,
              stock,
              fornecedor,
              tipoProd,
              utilizador_id: parseInt(userId),
              armazem_id: parseInt(armazem_id),
            }),
          });

          if (response.ok) {
            formProduto.reset();
            await carregarProdutos();
            alert(`Produto "${nome}" registado no armazém!`, "sucesso");
          } else {
            alert("Erro ao criar produto", "erro");
          }
        });
      } catch (err) {
        console.error(err);
        alert("Erro ao criar produto", "erro");
      }
    });
  }

  const armazemInput = document.getElementById("armazem_id");
  if (armazemInput && !armazemInput.value) {
    armazemInput.value = sessionStorage.getItem("armazem_id") || "";
  }

  carregarProdutos();

  const menuBTN = document.getElementById("menuBTN");
  const menu = document.getElementById("menu");

  menuBTN.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("active");
    PDF_list.classList.toggle("active");
  });

  document.addEventListener("click", () => {
    menu.classList.remove("active");
    PDF_list.classList.remove("active");
  });
};
