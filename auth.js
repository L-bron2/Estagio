const baseAPI = "http://localhost:3000";
const baseURL = window.location.origin;
let loaderAtivo = 0;

function verificarLogin() {
  return Boolean(sessionStorage.getItem("userId"));
}

function temPermissao(paginaRequerida) {
  const perfilId = parseInt(sessionStorage.getItem("perfil_id"), 10);

  const permissoes = {
    produtos: [4, 5, 6],
    consumo: [4, 5, 6],
    movimentos: [5, 6],
    contagem: [4, 5, 6],
    transferencia: [4, 5, 6],
    controle: [4, 5, 6],
    relatorio: [4, 5, 6],
    Rmensal: [4, 5, 6],
    pdfMovimento: [5, 6],
    ficha: [4, 5, 6],
    MeuResumo: [4, 5, 6],
    meuRegistro: [4, 5, 6],
    criarConta: [5, 6],
  };

  return permissoes[paginaRequerida]?.includes(perfilId) || false;
}

function protegerComPermissao(paginaRequerida) {
  if (!verificarLogin()) {
    window.location.href = `${baseURL}/login/login.html`;
    return;
  }

  if (!temPermissao(paginaRequerida)) {
    alert("Nao tem permissao para aceder a esta pagina", "erro");
    window.location.href = `${baseURL}/controle/controle.html`;
  }
}

function garantirLoader() {
  if (!document.body) {
    return null;
  }

  let loader = document.getElementById("loader");

  if (!document.getElementById("global-loader-style")) {
    const style = document.createElement("style");
    style.id = "global-loader-style";
    style.textContent = `
      #loader {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.4);
        backdrop-filter: blur(8px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 99999;
        transition: opacity 0.3s ease, visibility 0.3s ease;
      }

      #loader.hidden {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      .loader-box {
        background: rgba(255, 255, 255, 0.88);
        backdrop-filter: blur(20px);
        padding: 30px 40px;
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 15px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
      }

      .loader-box p {
        font-size: 0.9rem;
        color: #475569;
      }

      .spinner {
        width: 45px;
        height: 45px;
        border: 4px solid rgba(99, 102, 241, 0.2);
        border-top: 4px solid #6366f1;
        border-radius: 50%;
        animation: global-loader-spin 0.8s linear infinite;
      }

      @keyframes global-loader-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `;

    document.head.appendChild(style);
  }

  if (!loader) {
    loader = document.createElement("div");
    loader.id = "loader";
    loader.className = "hidden";
    loader.innerHTML = `
      <div class="loader-box">
        <div class="spinner"></div>
        <p>A carregar...</p>
      </div>
    `;
    document.body.appendChild(loader);
  } else if (!loader.classList.contains("hidden")) {
    loader.classList.add("hidden");
  }

  return loader;
}

function mostrarLoader() {
  const loader = garantirLoader();

  if (!loader) {
    return;
  }

  loaderAtivo += 1;
  loader.classList.remove("hidden");
}

function esconderLoader() {
  const loader = garantirLoader();

  if (!loader) {
    return;
  }

  loaderAtivo = Math.max(0, loaderAtivo - 1);

  if (loaderAtivo === 0) {
    loader.classList.add("hidden");
  }
}

async function comLoader(callback) {
  mostrarLoader();

  try {
    return await callback();
  } finally {
    esconderLoader();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", garantirLoader);
} else {
  garantirLoader();
}
