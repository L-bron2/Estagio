let armazens = [];
let produtosTransferencia = [];

// CARREGAR LISTA DE ARMAZÉNS
async function carregarArmazens() {
  await comLoader(async () => {
    try {
      const response = await fetch(`${baseAPI}/armazens`);
      if (!response.ok) throw new Error("Erro ao buscar armazéns");

      armazens = await response.json();
      preencherSelectsArmazens();

      // Se o utilizador for funcionário, carregar produtos do seu armazém de origem
      const perfilId = parseInt(sessionStorage.getItem("perfil_id"), 10);
      if (perfilId === 4) {
        carregarProdutosTransferencia();
      }
    } catch (err) {
      console.error("Erro ao carregar armazéns:", err);
      alert("Erro ao carregar lista de armazéns", "erro");
    }
  });
}

// PREENCHER SELECTS COM ARMAZÉNS
function preencherSelectsArmazens() {
  const selectOrigem = document.getElementById("armazem-origem");
  const selectDestino = document.getElementById("armazem-destino");
  const perfilId = parseInt(sessionStorage.getItem("perfil_id"), 10);
  const armazemUsuario = parseInt(sessionStorage.getItem("armazem_id"), 10);

  // Limpar selects antes de preencher
  selectOrigem.innerHTML =
    '<option value="">-- Selecione um armazém--</option>';
  selectDestino.innerHTML =
    '<option value="">-- Selecione um armazém--</option>';

  armazens.forEach((armazem) => {
    // Funcionários podem usar o seu armazém de origem, mas podem transferir para qualquer destino
    if (perfilId === 4 && armazem.codigo !== armazemUsuario) {
      // Adicionar apenas ao destino, não a origem
      const optDestino = document.createElement("option");
      optDestino.value = armazem.codigo;
      optDestino.textContent = armazem.descricao;
      selectDestino.appendChild(optDestino);
      return;
    }

    const optOrigem = document.createElement("option");
    optOrigem.value = armazem.codigo;
    optOrigem.textContent = armazem.descricao;
    selectOrigem.appendChild(optOrigem);

    const optDestino = document.createElement("option");
    optDestino.value = armazem.codigo;
    optDestino.textContent = armazem.descricao;
    selectDestino.appendChild(optDestino);
  });

  if (perfilId === 4) {
    // Bloquear origem para funcionários e ficar no armazém do utilizador
    selectOrigem.value = armazemUsuario;
    selectOrigem.disabled = true;
  } else {
    selectOrigem.disabled = false;
  }
}

// CARREGAR PRODUTOS DO ARMAZÉM SELECIONADO
async function carregarProdutosTransferencia() {
  const armazemId = document.getElementById("armazem-origem").value;

  const tabela = document.getElementById("tabela-transferencia");
  const mensagem = document.getElementById("mensagem-vazia");

  if (!armazemId) {
    tabela.style.display = "none";
    mensagem.textContent =
      "Selecione um armazém de origem para visualizar os produtos";
    mensagem.style.display = "block";
    produtosTransferencia = [];
    return;
  }

  await comLoader(async () => {
    try {
      const response = await fetch(`${baseAPI}/produtos?armazem_id=${armazemId}`);
      if (!response.ok) throw new Error("Erro ao buscar produtos");

      produtosTransferencia = await response.json();

      if (!produtosTransferencia.length) {
        tabela.style.display = "none";
        mensagem.textContent = "Nenhum produto disponível neste armazém";
        mensagem.style.display = "block";
        return;
      }

      mostrarProdutosTransferencia();
      mensagem.style.display = "none";
      tabela.style.display = "table";
    } catch (err) {
      console.error("Erro ao carregar produtos:", err);
      alert("Erro ao carregar produtos", "erro");
    }
  });
}

// MOSTRAR PRODUTOS NA TABELA
function mostrarProdutosTransferencia() {
  const tbody = document.getElementById("tabela-produtos-trans");
  tbody.innerHTML = "";

  produtosTransferencia.forEach((produto) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="id">${produto.id}</td>
      <td class="campo-nome">${produto.nome}</td>
      <td class="campo-fornecedor">${produto.fornecedor || "-"}</td>
      <td class="campo-stock">${produto.stock}</td>
      <td class="campo-quantidade">
        <input 
          type="number" 
          id="qtd-${produto.id}" 
          class="input-quantidade"
          min="0" 
          max="${produto.stock}"
          value="0"
          placeholder="0"
        >
      </td>
      <td>
        <button class="btn-remover" onclick="removerLinhaTransferencia(${produto.id})">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  atualizarVisibilidadeBotaoTransferir();
}

// REMOVER LINHA DE TRANSFERÊNCIA
function removerLinhaTransferencia(produtoId) {
  const input = document.getElementById(`qtd-${produtoId}`);
  if (input) input.value = "0";
  atualizarVisibilidadeBotaoTransferir();
}

//  VISIBILIDADE DO BOTÃO TRANSFERIR
function atualizarVisibilidadeBotaoTransferir() {
  const armazemDestino = document.getElementById("armazem-destino").value;
  const temQuantidades = Array.from(
    document.querySelectorAll(".input-quantidade"),
  ).some((input) => parseInt(input.value, 10) > 0);

  const btnTransferir = document.getElementById("btn-transferir");
  btnTransferir.style.display =
    armazemDestino && temQuantidades ? "block" : "none";
}

// CONFIRMAR TRANSFERÊNCIA
async function confirmarTransferencia() {
  const armazemOrigem = document.getElementById("armazem-origem").value;
  const armazemDestino = document.getElementById("armazem-destino").value;
  const userId = sessionStorage.getItem("userId");

  if (!armazemOrigem || !armazemDestino) {
    alert("Selecione armazÃ©ns de origem e destino", "aviso");
    return;
  }

  if (armazemOrigem === armazemDestino) {
    alert("Armazém de origem e destino não podem ser iguais", "aviso");
    return;
  }

  const transferencias = [];
  document.querySelectorAll(".input-quantidade").forEach((input, index) => {
    const quantidade = parseInt(input.value, 10);
    if (quantidade > 0) {
      const produtoId = produtosTransferencia[index].id;
      transferencias.push({ produto_id: produtoId, quantidade });
    }
  });

  if (!transferencias.length) {
    alert("Selecione pelo menos um produto e uma quantidade", "aviso");
    return;
  }

  const btn = document.getElementById("btn-transferir");
  btn.disabled = true;
  btn.textContent = "A processar...";

  try {
    await comLoader(async () => {
      const response = await fetch(`${baseAPI}/transferir-produtos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          armazem_origem: parseInt(armazemOrigem, 10),
          armazem_destino: parseInt(armazemDestino, 10),
          utilizador_id: parseInt(userId, 10),
          transferencias,
        }),
      });

      if (response.ok) {
        alert("Transferência realizada com sucesso!", "sucesso");
        limparFormulario();
        await carregarProdutosTransferencia();
      } else {
        const errorText = await response.text();
        alert(`Erro: ${errorText}`, "erro");
      }
    });
  } catch (err) {
    console.error(err);
    alert("Erro ao processar transferência", "erro");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmar transferência";
  }
}

// LIMPAR FORMULÃRIO
function limparFormulario() {
  document.querySelectorAll(".input-quantidade").forEach((input) => {
    input.value = "0";
  });
  atualizarVisibilidadeBotaoTransferir();
}

// EVENTOS
window.onload = () => {
  protegerComPermissao("transferencia");

  carregarArmazens();

  document.getElementById("armazem-origem").addEventListener("change", () => {
    carregarProdutosTransferencia();
    atualizarVisibilidadeBotaoTransferir();
  });

  document.getElementById("armazem-destino").addEventListener("change", () => {
    atualizarVisibilidadeBotaoTransferir();
  });

  document
    .getElementById("btn-transferir")
    .addEventListener("click", confirmarTransferencia);

  document.addEventListener("input", (e) => {
    if (e.target.classList.contains("input-quantidade")) {
      atualizarVisibilidadeBotaoTransferir();
    }
  });
};
