//  login com códigos
async function loginComCodigos(codigoUser, codigoArmazem) {
  if (!codigoUser || !codigoArmazem) {
    alert("Preenche todos os campos", "aviso");
    return false;
  }

  try {
    return await comLoader(async () => {
      const response = await fetch("http://localhost:3000/verificar-acesso", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: parseInt(codigoUser),
          armazem_codigo: codigoArmazem,
        }),
      });

      if (response.ok) {
        const data = await response.json();

        sessionStorage.setItem("userId", data.userId);
        sessionStorage.setItem("armazem_id", data.armazem_id);
        sessionStorage.setItem("armazem_codigo", data.armazem_codigo || "");
        sessionStorage.setItem("perfil_id", data.perfil_id);
        sessionStorage.setItem("nome", data.nome);

        console.log(
          "Login bem-sucedido (códigos). userId:",
          data.userId,
          "perfil:",
          data.perfil_id,
        );
        window.location.href = "../controle/controle.html";
        return true;
      } else {
        const erro = await response.text();
        console.error("Erro servidor:", erro);
        alert("Código de utilizador ou armazém inválido", "erro");
        return false;
      }
    });
  } catch (err) {
    console.error("Erro conexao:", err);
    alert("Erro de conexão com o servidor", "erro");
    return false;
  }
}

// login com email
async function loginComEmail(email, password) {
  if (!email || !password) {
    alert("Preenche todos os campos", "aviso");
    return false;
  }

  try {
    return await comLoader(async () => {
      const response = await fetch("http://localhost:3000/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        sessionStorage.setItem("userId", data.userId);
        sessionStorage.setItem("armazem_id", data.armazem_id);
        sessionStorage.setItem("armazem_codigo", data.armazem_codigo || "");
        sessionStorage.setItem("perfil_id", data.perfil_id);
        sessionStorage.setItem("nome", data.nome);

        console.log(
          "Login bem-sucedido (email). userId:",
          data.userId,
          "perfil:",
          data.perfil_id,
        );
        window.location.href = "../controle/controle.html";
        return true;
      } else {
        console.error("Erro login:", data.message);
        alert(data || "Credenciais inválidas", "erro");
        return false;
      }
    });
  } catch (error) {
    console.error("Erro conexao:", error);
    alert("Email ou palavra-passe inválidos, Tente novamente", "erro");
    return false;
  }
}

// Handler para o formulario de login
async function login() {
  const credencial = document.getElementById("credencial").value.trim();
  const senha = document.getElementById("senha").value.trim();

  if (!credencial || !senha) {
    alert("Preenche todos os campos", "aviso");
    return;
  }

  // verificar se email ou codigos
  if (credencial.includes("@")) {
    // Login com Email
    await loginComEmail(credencial, senha);
  } else {
    // Login com Códigos
    const codigoUser = parseInt(credencial, 10);
    const codigoArmazem = senha;

    if (isNaN(codigoUser) || codigoArmazem.length === 0) {
      alert(
        "Campos invalidos. Use email+palavra-passe ou codigo do armazem",
        "aviso",
      );
      return;
    }

    await loginComCodigos(codigoUser, codigoArmazem);
  }
}

// FORM
const form = document.getElementById("Login");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  login();
});
