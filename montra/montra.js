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
        <button class="btnConsumo" onclick="RegistrarContagem(${produto.id}, event)">Contagem </button>
        
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

//REGISTRAR MOVIMENTO DE CONTAGEM DO PRODUTOS
async function RegistrarContagem(id, event) {
  const input = document.getElementById(`add-${id}`);
  const quantidade = parseInt(input.value, 10);

  const userId = sessionStorage.getItem("userId");
  const armazem_id = sessionStorage.getItem("armazem_id");

  if (!quantidade || quantidade <= 0) {
    alert("Quantidade inválida", "aviso");
    return;
  }

  if (!userId || !armazem_id) {
    alert("sessão expirada. Faz login novamente.");
    return;
  }

  const produto = produtos.find((p) => p.id === id);

  // verificar stock
  if (!produto || quantidade > produto.stock) {
    alert("Stock insuficiente");
    return;
  }

  const utilizador_id = parseInt(userId, 10);
  const armazemId = parseInt(armazem_id, 10);

  if (Number.isNaN(utilizador_id) || Number.isNaN(armazemId)) {
    alert("Dados inválidos", "erro");
    return;
  }

  const btn = event.target;
  btn.disabled = true;
  btn.innerText = "A processar...";

  try {
    await comLoader(async () => {
      const response = await fetch(`${baseAPI}/RegistrarContegem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          produto_id: id,
          quantidade,
          utilizador_id,
          armazem_id: armazemId,
        }),
      });

      const responseText = await response.text();

      if (response.ok && response.status === 201) {
        input.value = "";
        await carregarProdutos();
        alert("Contagem registrada!");
      } else {
        alert(responseText || "Erro ao registar contagem");
      }
    });
  } catch (err) {
    console.error(err);
    alert("Erro ao registar contagem");
  } finally {
    btn.disabled = false;
    btn.innerText = "Contagem";
  }
}

// Paginação
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
  });

  document.addEventListener("click", () => {
    menu.classList.remove("active");
  });
};
