//verificar sessão
const userSession = sessionStorage.getItem("userId");
if (!userSession) {
  alert("Sessão expirada. Faça login novamente.");
  window.location.href = "../login/login.html";
}

// formatar data
function formatarData(data) {
  if (!data) {
    return "---";
  }

  return new Date(data).toLocaleString("pt-PT");
}

// mostrar historico no modal
function renderizarHistorico(visualizacoes) {
  const container = document.getElementById("pdf-views-container");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!visualizacoes || visualizacoes.length === 0) {
    container.innerHTML =
      '<p class="empty-history">Ainda nao existem registros.</p>';
    return;
  }

  visualizacoes.forEach((item) => {
    const card = document.createElement("div");
    card.className = "pdf-view-item";
    card.innerHTML = `
      <strong>${item.pdf_nome}</strong>
      <span class="pdf-view-meta">Utilizador: ${item.utilizador_nome}</span>
      <span class="pdf-view-meta">Data: ${formatarData(item.data_visualizacao)}</span>
    `;
    container.appendChild(card);
  });
}

//guardar localização da loja (para ir buscar os registros corretos na bd)
async function guardarLocation(userId) {
  const selectLocation = document.getElementById("location");

  if (!selectLocation) {
    return;
  }

  const location = selectLocation.value.trim();

  if (!location) {
    return;
  }

  try {
    const res = await fetch(`${baseAPI}/location/${userId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ location }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Erro ao guardar localização");
    }

    console.log(data);

  } catch (err) {
    console.error("Erro ao guardar localização", err);
    alert(err.message || "Erro ao guardar localização");
  }
}

document.getElementById("location")?.addEventListener("change", () => {
  const userId = sessionStorage.getItem("userId");

  if (userId) {
    guardarLocation(userId);
  }
});

// carregar historico dos pdfs
async function carregarHistoricoPDFs() {
  const userId = sessionStorage.getItem("userId");

  if (!userId) {
    return;
  }

  await comLoader(async () => {
    try {
      const res = await fetch(`${baseAPI}/pdf-visualizacoes?userId=${userId}`);

      if (!res.ok) {
        renderizarHistorico([]);
        return;
      }

      const visualizacoes = await res.json();
      renderizarHistorico(visualizacoes);
    } catch (err) {
      console.error(err);
      renderizarHistorico([]);
    }
  });
}

// abrir modal historico
function abrirModalHistorico() {
  const modal = document.getElementById("pdf-views-modal");

  if (!modal) {
    return;
  }

  modal.style.display = "flex";
  carregarHistoricoPDFs();
}

// fechar modal historico
function fecharModalHistorico(e) {
  const modal = document.getElementById("pdf-views-modal");

  if (e.target == modal) {
    modal.style.display = "none";
    return;
  }
}

//campo para inserir pdfs
const pdfInput = document.getElementById("pdfFile");
const allowedFileExtensions = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".dat",
];
const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/msexcel",
  "application/x-msexcel",
  "application/x-ms-excel",
  "application/x-excel",
  "application/x-dos_ms_excel",
  "application/xls",
  "application/x-xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.ms-office",
  "application/octet-stream",
];

function temExtensaoPermitida(fileName) {
  const nome = (fileName || "").toLowerCase();
  return allowedFileExtensions.some((ext) => nome.endsWith(ext));
}

if (pdfInput) {
  pdfInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    const fileNameDisplay = document.getElementById("file-name");

    if (!file) {
      fileNameDisplay.textContent = "Nenhum ficheiro selecionado";
      return;
    }

    const mimeValido = !file.type || allowedMimeTypes.includes(file.type);
    const extensaoValida = temExtensaoPermitida(file.name);

    if (!extensaoValida) {
      alert(
        "Seleciona um ficheiro valido: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT ou DAT.",
      );
      this.value = "";
      fileNameDisplay.textContent = "Nenhum ficheiro selecionado";
      return;
    }

    if (!mimeValido) {
      console.warn(
        `Tipo MIME inesperado (${file.type}); ficheiro aceite pela extensao.`,
      );
    }

    if (this.files.length > 1) {
      alert("Seleciona apenas um ficheiro.");
      this.value = "";
      fileNameDisplay.textContent = "Nenhum ficheiro selecionado";
      return;
    }

    fileNameDisplay.textContent = "Selecionado: " + file.name;
  });
}

//carregar dados do utilizador
async function carregarCodigos() {
  const userId = sessionStorage.getItem("userId");
  const armazem_id = sessionStorage.getItem("armazem_id");
  const armazem_codigo = sessionStorage.getItem("armazem_codigo");
  const perfil_id = parseInt(sessionStorage.getItem("perfil_id"));
  let nome = sessionStorage.getItem("nome");

  if (!userId) {
    window.location.href = `${baseURL}/login/login.html`;
    return;
  }

  if (!nome || nome === "null" || nome === "undefined") {
    await comLoader(async () => {
      try {
        const res = await fetch(`${baseAPI}/utilizador/${userId}`);
        if (res.ok) {
          const data = await res.json();
          nome = data.nome;
          sessionStorage.setItem("nome", nome);
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  const nivelAcesso =
    perfil_id === 4
      ? "Funcionario"
      : perfil_id === 5
        ? "Gerente"
        : perfil_id === 6
          ? "Administrador"
          : "Desconhecido";

  document.getElementById("nome_utilizador").innerHTML =
    `Nome: <span> ${nome || "---"}</span>`;

  document.getElementById("Meu_codigo").innerHTML =
    `Utilizador: <span> ${userId}</span>`;

  document.getElementById("Codigo_armazem").innerHTML =
    `Armazem: <span> ${armazem_codigo || armazem_id || "---"}</span>`;

  document.getElementById("nivel_acesso").innerHTML =
    `Nivel de Acesso: <span> ${nivelAcesso}</span>`;

  await comLoader(async () => {
    try {
      const res = await fetch(`${baseAPI}/numeroTotalProdutos`);
      const dados = await res.json();

      document.getElementById("numeroProdutos").innerHTML =
        `Total Produtos: <span> ${dados.total}</span>`;
    } catch (err) {
      console.error(err);
    }
  });
}

//sair
function logout() {
  sessionStorage.clear();
  window.location.href = "../login/login.html";
}

//permissoes
function atualizarMenuPorPermissoes() {
  const perfilId = parseInt(sessionStorage.getItem("perfil_id"));

  document.getElementById("link-produtos").style.display = "block";
  document.getElementById("link-consumo").style.display = "block";
  document.getElementById("link-movimentos").style.display = "block";
  document.getElementById("link-contagem").style.display = "block";
  document.getElementById("link-transferencia").style.display = "block";
  document.getElementById("link-login").style.display = "none";
  document.getElementById("link-pdfMovimento").style.display = "block";
  document.getElementById("link-registro").style.display = "block";

  if (perfilId === 4) {
    document.getElementById("link-movimentos").style.display = "none";
    document.getElementById("link-pdfMovimento").style.display = "none";
  } else if (perfilId === 5 || perfilId === 6) {
    document.getElementById("link-login").style.display = "block";
  }
}

//upload pdf
document
  .getElementById("sendPDF")
  .addEventListener("submit", async function (e) {
    e.preventDefault();

    const userId = sessionStorage.getItem("userId");
    const pdfName = document.getElementById("pdfName").value;
    const pdfFile = document.getElementById("pdfFile").files[0];

    if (!pdfName || !pdfFile) {
      alert("selecione um ficheiro e dê-lhe um nome.");
      return;
    }

    const formData = new FormData();
    formData.append("pdfName", pdfName);
    formData.append("pdfFile", pdfFile);
    formData.append("userId", userId);

    await comLoader(async () => {
      try {
        const response = await fetch(`${baseAPI}/upload`, {
          method: "POST",
          body: formData,
        });

        if (response.ok) {
          document.getElementById("pdfName").value = "";
          document.getElementById("pdfFile").value = "";
          document.getElementById("file-name").textContent =
            "Nenhum ficheiro selecionado";

          await carregarPDFs();
        } else {
          const erro = await response.text();
          alert(erro || "Erro ao enviar PDF");
        }
      } catch (err) {
        console.error(err);
      }
    });
  });

//carregar pdfs
async function carregarPDFs() {
  const userId = sessionStorage.getItem("userId");
  const verPDF = document.getElementById("open-history");

  await comLoader(async () => {
    try {
      const res = await fetch(`${baseAPI}/pdfs?userId=${userId}`);

      if (res.status === 403) {
        document.getElementById("termos-modal").style.display = "flex";
        return;
      }

      if (!res.ok) {
        document.getElementById("PDF-list").style.display = "none";
        verPDF.style.display = "none";
        return;
      }

      const pdfs = await res.json();

      const lista = document.getElementById("PDF_list");
      const container = document.getElementById("pdf-container");

      container.innerHTML = "";

      if (!pdfs || pdfs.length === 0) {
        lista.style.display = "none";
        verPDF.style.display = "none";
        return;
      }

      lista.style.display = "block";
      verPDF.style.display = "block";

      const perfilId = parseInt(sessionStorage.getItem("perfil_id"), 10);
      const podeApagarPDF = perfilId === 5 || perfilId === 6;

      pdfs.forEach((pdf) => {
        const div = document.createElement("div");
        const pdfUrl = `${baseAPI}/pdf/${pdf.id}?userId=${userId}`;
        const botaoApagar = podeApagarPDF
          ? `
            <button class="deleteBTN" data-id="${pdf.id}">
              <span class="material-symbols-outlined">delete</span>
            </button>
          `
          : "";

        div.innerHTML = `
          <strong>${pdf.nome}</strong><br>
          <small>${formatarData(pdf.DataUpload)}</small><br>
          <a href="${pdfUrl}" target="_blank" class="pdf-link" data-pdf-id="${pdf.id}">Ver PDF</a>
          ${botaoApagar}
        `;

        container.appendChild(div);
      });

      document.querySelectorAll(".pdf-link").forEach((link) => {
        link.addEventListener("click", () => {
          setTimeout(() => {
            carregarHistoricoPDFs();
          }, 800);
        });
      });

      document.querySelectorAll(".deleteBTN").forEach((button) => {
        button.addEventListener("click", async function () {
          const pdfID = this.getAttribute("data-id");

          if (!confirm("Tens a certeza que queres eliminar este PDF?")) {
            return;
          }

          await comLoader(async () => {
            const response = await fetch(`${baseAPI}/pdf/${pdfID}`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: Number(userId) }),
            });

            if (!response.ok) {
              const erro = await response.text();
              alert(erro || "Erro ao apagar PDF");
              return;
            }

            await carregarPDFs();
            await carregarHistoricoPDFs();
          });
        });
      });
    } catch (err) {
      console.error(err);
    }
  });
}

//cookies
function setCookie(nome, valor, dias) {
  const d = new Date();
  d.setTime(d.getTime() + dias * 24 * 60 * 60 * 1000);
  document.cookie = `${nome}=${valor};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(nome) {
  const cookies = document.cookie.split("; ");

  for (let c of cookies) {
    const [k, v] = c.split("=");
    if (k === nome) return v;
  }

  return null;
}

//aceitar termos
document
  .getElementById("aceitar-termos")
  .addEventListener("click", async () => {
    const userId = sessionStorage.getItem("userId");

    if (!userId) {
      console.error("userId nao encontrado");
      return;
    }

    setCookie("termos_pdfs", "sim", 365);

    document.getElementById("termos-modal").style.display = "none";

    await comLoader(async () => {
      try {
        await fetch(`${baseAPI}/aceitar-termos-pdfs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: Number(userId) }),
        });

        await carregarPDFs();
      } catch (err) {
        console.error(err);
      }
    });
  });

//verificar termos
function verificarTermos() {
  const modal = document.getElementById("termos-modal");
  const aceitou = getCookie("termos_pdfs");

  if (aceitou === "sim") {
    modal.style.display = "none";
    carregarPDFs();
  } else {
    modal.style.display = "flex";
  }
}

//init
const btnSair = document.getElementById("sair");
if (btnSair) {
  btnSair.addEventListener("click", logout);
}

//btn abrir historico
const btnAbrirHistorico = document.getElementById("open-history");
if (btnAbrirHistorico) {
  btnAbrirHistorico.addEventListener("click", abrirModalHistorico);
}

//btn fechar historico
const btnFecharHistorico = document.getElementById("close-history");
if (btnFecharHistorico) {
  btnFecharHistorico.addEventListener("click", fecharModalHistorico);
}

//fechar modal de historico ao clicar fora da caixa
window.addEventListener("click", fecharModalHistorico);

//DOM
document.addEventListener("DOMContentLoaded", () => {
  carregarCodigos();
  atualizarMenuPorPermissoes();
  carregarPDFs();
  verificarTermos();
  const PDF_list = document.getElementById("PDF_list");

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
});
