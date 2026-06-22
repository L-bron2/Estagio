const listAPI = `${baseAPI}/produtos`;
const armazensAPI = `${baseAPI}/armazens`;

let produtos = [];
let armazens = [];
let paginaAtual = 1;
const porPagina = 12;

const armazensPadrao = [
  { codigo: 5, descricao: "ArmazemP(P): AMZ005" },
  { codigo: 6, descricao: "Armazem(S): AMZ006" },
  { codigo: 7, descricao: "Armazem(C): AMZ007" },
];

const nomesTipoProduto = {
  prodVenda: "Produto para venda",
  prodConsumo: "Produto para consumo",
  prodBrinde: "Produto para brinde",
};

function nomeTipoProduto(tipoProd) {
  return nomesTipoProduto[tipoProd] || "-";
}

function escapeHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (char) => {
    const entidades = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entidades[char];
  });
}

function selectTemValor(select, valor) {
  return Array.from(select.options).some(
    (option) => option.value === String(valor),
  );
}

function adicionarOpcaoArmazem(select, armazem) {
  const option = document.createElement("option");
  option.value = armazem.codigo;
  option.textContent = armazem.descricao || `Armazem ${armazem.codigo}`;
  select.appendChild(option);
}

function obterNomeArmazem(armazemId) {
  const armazem = armazens.find(
    (item) => String(item.codigo) === String(armazemId),
  );

  return armazem?.descricao || "-";
}

function atualizarArmazemInfo() {
  const armazemNome = document.getElementById("armazem-nome");
  const filtroArmazem = document.getElementById("filtroArmazem");

  if (!armazemNome) {
    return;
  }

  armazemNome.innerText = filtroArmazem?.value
    ? obterNomeArmazem(filtroArmazem.value)
    : "Todos os armazens";
}

function preencherArmazemDestinoPadrao() {
  const armazemDestino = document.getElementById("armazemDestino");
  const filtroArmazem = document.getElementById("filtroArmazem");
  const armazemSessao = sessionStorage.getItem("armazem_id") || "";
  const armazemPreferido = filtroArmazem?.value || armazemSessao;

  if (
    armazemDestino &&
    armazemPreferido &&
    selectTemValor(armazemDestino, armazemPreferido)
  ) {
    armazemDestino.value = armazemPreferido;
  }
}

function preencherSelectsArmazem() {
  const filtroArmazem = document.getElementById("filtroArmazem");
  const armazemDestino = document.getElementById("armazemDestino");
  const armazemSessao = sessionStorage.getItem("armazem_id") || "";

  if (filtroArmazem) {
    const valorAtual = filtroArmazem.value || armazemSessao;
    filtroArmazem.innerHTML = "";

    const todos = document.createElement("option");
    todos.value = "";
    todos.textContent = "Todos os armazens";
    filtroArmazem.appendChild(todos);

    armazens.forEach((armazem) => adicionarOpcaoArmazem(filtroArmazem, armazem));

    filtroArmazem.value =
      valorAtual && selectTemValor(filtroArmazem, valorAtual) ? valorAtual : "";
  }

  if (armazemDestino) {
    const valorAtual = armazemDestino.value || filtroArmazem?.value || armazemSessao;
    armazemDestino.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = "Armazem";
    armazemDestino.appendChild(placeholder);

    armazens.forEach((armazem) =>
      adicionarOpcaoArmazem(armazemDestino, armazem),
    );

    if (valorAtual && selectTemValor(armazemDestino, valorAtual)) {
      armazemDestino.value = valorAtual;
    }
  }

  atualizarArmazemInfo();
}

async function carregarArmazens() {
  try {
    const response = await fetch(armazensAPI);

    if (!response.ok) {
      throw new Error("Erro ao buscar armazens");
    }

    armazens = await response.json();

    if (!Array.isArray(armazens) || armazens.length === 0) {
      armazens = armazensPadrao;
    }
  } catch (err) {
    console.error(err);
    armazens = armazensPadrao;
  }

  preencherSelectsArmazem();
}

function obterFiltroArmazem() {
  const filtroArmazem = document.getElementById("filtroArmazem");

  if (filtroArmazem) {
    return filtroArmazem.value;
  }

  return sessionStorage.getItem("armazem_id") || "";
}

// CARREGAR PRODUTOS
async function carregarProdutos() {
  await comLoader(async () => {
    try {
      const params = new URLSearchParams();
      const armazemId = obterFiltroArmazem();

      if (armazemId) {
        params.set("armazem_id", armazemId);
      }

      const url = params.toString() ? `${listAPI}?${params}` : listAPI;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Erro ao buscar produtos");
      }

      produtos = await response.json();
      mostrarProdutos();
      atualizarArmazemInfo();
    } catch (err) {
      console.error(err);
    }
  });
}

// MOSTRAR PRODUTOS
function mostrarProdutos() {
  const tabela = document.getElementById("tabela-produtos");
  tabela.innerHTML = "";

  const termoPesquisa = document.getElementById("pesquisa")?.value || "";
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
    const produtoId = parseInt(produto.id, 10);

    if (Number(produto.stock) <= 2) {
      tr.classList.add("baixo");
    }

    //Permissões para apagar produto (apenas admin e gerente)
    const perfilId = parseInt(sessionStorage.getItem("perfil_id"), 10);
    const podeApagar = perfilId === 5 || perfilId === 6;
    const botaoApagar = podeApagar
      ? `<button class="apagarProdBTN" onclick="apagarProduto(${produtoId})">Apagar</button>`
      : "";


      //campos da tabela de produto
    tr.innerHTML = `
      <td>${escapeHtml(produto.id)}</td>
      <td>${escapeHtml(produto.nome)}</td>
      <td>${escapeHtml(nomeTipoProduto(produto.tipoProd))}</td>
      <td>
        <input type="text"class="input-fornecedor"
          value="${escapeHtml(produto.fornecedor || "")} "aria-label="Fornecedor de ${escapeHtml(produto.nome)}">

      </td>
      <td>${escapeHtml(produto.armazem_nome || "-")}</td>
      <td>${escapeHtml(produto.stock)}</td>

      <td class="acoes-produto">
        <button class="guardarProdBTN" onclick="guardarFornecedor(${produtoId}, this)">Guardar</button>
        ${botaoApagar}
      </td>
    `;

    tabela.appendChild(tr);
  });

  document.getElementById("pagina-info").innerText =
    `Pagina ${paginaAtual} de ${totalPaginas}`;
}


//guardar fornecedor
async function guardarFornecedor(id, botao) {
  const linha = botao?.closest("tr");
  const input = linha?.querySelector(".input-fornecedor");
  const fornecedor = input?.value.trim();

  if (!fornecedor) {
    alert("Fornecedor obrigatorio");
    return;
  }

  try {
    await comLoader(async () => {
      const response = await fetch(`${listAPI}/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fornecedor
        }),
      });

      if (!response.ok) {
        const erro = await response.text();
        throw new Error(erro || "Erro ao atualizar fornecedor");
      }

      await carregarProdutos();
      alert("Fornecedor atualizado!");
    });
  } catch (err) {
    console.error(err);
    alert(err.message || "Erro ao atualizar fornecedor");
  }
}

// APAGAR PRODUTO
async function apagarProduto(id) {
  if (!confirm("Tens a certeza?")) return;

  const userId = sessionStorage.getItem("userId");

  try {
    await comLoader(async () => {
      const response = await fetch(`${listAPI}/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: parseInt(userId, 10) }),
      });

      if (response.ok) {
        alert("Produto apagado!", "sucesso");
        await carregarProdutos();
        if (typeof carregarCodigos === "function") carregarCodigos();
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert("Erro: " + (errorData.message || "Erro ao apagar produto"));
      }
    });
  } catch (err) {
    console.error(err);
    alert("Erro ao apagar produto");
  }
}

// Paginacao
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
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

window.onload = async () => {
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

  const filtroArmazem = document.getElementById("filtroArmazem");
  if (filtroArmazem) {
    filtroArmazem.addEventListener("change", async () => {
      paginaAtual = 1;
      preencherArmazemDestinoPadrao();
      await carregarProdutos();
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
      const armazemDestino = document.getElementById("armazemDestino").value;

      const userId = sessionStorage.getItem("userId");
      const armazemIdSessao = sessionStorage.getItem("armazem_id");

      if (!userId) {
        alert("Sessao expirada. Faca login novamente.");
        return;
      }

      if (!tipoProd) {
        alert("Escolha o tipo de produto");
        return;
      }

      if (!armazemDestino) {
        alert("Escolha o armazem do produto");
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
              armazemDestino,
              utilizador_id: parseInt(userId, 10),
              armazem_id: parseInt(armazemIdSessao || armazemDestino, 10),
            }),
          });

          if (!response.ok) {
            const erro = await response.text();
            throw new Error(erro || "Erro ao criar produto");
          }

          formProduto.reset();
          preencherArmazemDestinoPadrao();
          paginaAtual = 1;
          await carregarProdutos();
          alert(`Produto "${nome}" registado no armazem!`);
        });
      } catch (err) {
        console.error(err);
        alert(err.message || "Erro ao criar produto");
      }
    });
  }

  await carregarArmazens();
  await carregarProdutos();

  const menuBTN = document.getElementById("menuBTN");
  const menu = document.getElementById("menu");

  if (menuBTN && menu) {
    menuBTN.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("active");

      if (typeof PDF_list !== "undefined" && PDF_list) {
        PDF_list.classList.toggle("active");
      }
    });

    document.addEventListener("click", () => {
      menu.classList.remove("active");

      if (typeof PDF_list !== "undefined" && PDF_list) {
        PDF_list.classList.remove("active");
      }
    });
  }
};
