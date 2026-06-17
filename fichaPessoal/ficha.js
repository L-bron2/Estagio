const userIdSession = sessionStorage.getItem("userId");

//campos de dados do funcionario
const dadosTrabalho = document.getElementById("dadosTrabalho");
const morada = document.getElementById("morada");
const guardarBTN = document.getElementById("guardarBTN");

const form = document.getElementById("formDados");

//mostrar campos
function mostrarCampos() {
  dadosTrabalho.style.display = "block";
  morada.style.display = "block";
  guardarBTN.style.display = "block";
}

//carregar o codigo do utilizador
function preencherCodigoUser() {
  if (!userIdSession) {
    alert("Sessão inválida. Faz login novamente.");
    window.location.href = "../login/login.html";
    return false;
  }

  const input = document.getElementById("codigoUser");

  if (input) {
    input.value = userIdSession;
  }

  mostrarCampos();

  return true;
}

// carregar ficha
document.addEventListener("DOMContentLoaded", async () => {
  protegerComPermissao("ficha");

  const ok = preencherCodigoUser();

  if (!ok) {
    return;
  }

  try {
    const res = await fetch(`${baseAPI}/Ficha/${userIdSession}`);

    if (!res.ok) {
      return;
    }

    const d = await res.json();

    const set = (name, value) => {
      const el = document.querySelector(`[name='${name}']`);

      if (el) {
        el.value = value ?? "";
      }
    };

    set("numeroEmpregado", d.numero_empregado);
    set("nome", d.nome);
    set("cc", d.numero_cc);
    set("dataNascimento", d.data_nascimento?.split("T")[0]);
    set("estadoCivil", d.estado_civil);
    set("habilitacoes", d.habilitacoes);

    set("numeroB", d.numero_beneficiario);
    set("nif", d.numero_contribuinte);
    set("titulares", d.numero_titulares);
    set("dependentes", d.numero_dependentes);
    set("tipoContrato", d.tipo_contrato);
    set("profissao", d.profissao);
    set("salario", d.salario);

    set("morada", d.morada);
    set("naturalidade", d.naturalidade);
    set("freguesia", d.freguesia);
    set("concelho", d.concelho);
    set("distrito", d.distrito);
    set("codigoP", d.codigo_postal);
    set("telefone", d.telefone);
    set("email", d.email);

  } catch (err) {
    console.log("Erro ao carregar ficha:", err);
  }
});

//submit ficha
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  guardarBTN.disabled = true;

  try {
    const formData = new FormData(form);

    const dados = Object.fromEntries(formData.entries());

    dados.userCode = Number(userIdSession);

    dados.numeroEmpregado = Number(dados.numeroEmpregado);

    dados.titulares = Number(dados.titulares || 0);

    dados.dependentes = Number(dados.dependentes || 0);

    dados.salario = Number(dados.salario || 0);

    //validar numero empregado
    if (
      Number.isNaN(dados.numeroEmpregado) ||
      dados.numeroEmpregado <= 0
    ) {
      alert("Número de empregado inválido.");
      return;
    }

    const res = await fetch(`${baseAPI}/EnviarFicha`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dados),
    });

    const result = await res.json();

    //mostrar erro do backend
    if (!res.ok) {
      alert(result.message || "Erro ao guardar ficha.");
      return;
    }

    alert(result.message);

  } catch (err) {
    console.error("Erro ao enviar ficha:", err);

    alert("Erro inesperado. Tente novamente.");

  } finally {
    guardarBTN.disabled = false;
  }
});