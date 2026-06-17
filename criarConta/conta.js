async function criarConta() {
  const username = document.getElementById("username").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const armazem_id = document.getElementById("armazem_id").value;
  const perfil = document.getElementById("perfil").value;
  const criador_id = sessionStorage.getItem("userId")
    ? parseInt(sessionStorage.getItem("userId"), 10)
    : null;

  if (!username || !email || !password || !armazem_id || !perfil) {
    alert("Preencha todos os campos!", "aviso");
    return;
  }

  try {
    await comLoader(async () => {
      const response = await fetch(`${baseAPI}/criarConta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          password,
          armazem_codigo: armazem_id,
          perfil_id: parseInt(perfil),
          ...(criador_id && { criador_id }),
        }),
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { message: responseText };
      }

      if (response.ok) {
        alert("Conta criada com sucesso!", "sucesso");
        window.location.href = "../login/login.html";
      } else {
        console.error("Status:", response.status);
        console.error("Data:", data);
        alert(
          "Erro ao criar conta: " + (data.message || "Erro desconhecido"),
          "erro",
        );
      }
    });
  } catch (err) {
    console.error(err);
    alert("Erro ao criar conta", "erro");
  }
}

const form = document.getElementById("CriarConta");
form.addEventListener("submit", (event) => {
  event.preventDefault();
  criarConta();
});

window.addEventListener("load", () => {
  if (typeof verificarLogin === "function" && !verificarLogin()) {
    alert("Faca login antes de criar conta.", "aviso");
    window.location.href = "../controle/controle.html";
    return;
  }

  const perfilId = parseInt(sessionStorage.getItem("perfil_id"));
  // Apenas Gerentes (5) e Administradores (6) podem criar contas
  if (perfilId !== 5 && perfilId !== 6) {
    alert(
      "Apenas gerentes e administradores podem criar contas de funcionarios!",
      "erro",
    );
    window.location.href = "../controle/controle.html";
  }

  // Restringir opções de perfil baseadas no perfil do criador
  const selectPerfil = document.getElementById("perfil");
  if (perfilId === 5) {
    // Gerente só pode criar funcionários
    selectPerfil.innerHTML = `
      <option value="">-- Selecione um perfil --</option>
      <option value="4">Funcionário</option>
    `;
  } else if (perfilId === 6) {
    // Admin pode criar todos os perfis
    selectPerfil.innerHTML = `
      <option value="">-- Selecione um perfil --</option>
      <option value="4">Funcionário</option>
      <option value="5">Gerente</option>
      <option value="6">Administrador</option>
    `;
  }
});
