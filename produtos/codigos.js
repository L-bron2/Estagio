
//codigo so input de quanidade  se for preciso em algum outro momento
//<input type="number" id="add-${produto.id}" placeholder="Qtd" style="width:60px;">
//codigo do btn de consumo se for preciso em algum outro momento
// <button class="btnConsumo" onclick="consumirProduto(${produto.id}, event)">Consumir</button>

// // CONSUMIR PRODUTO
// async function consumirProduto(id, event) {
//   const input = document.getElementById(`add-${id}`);
//   const quantidade = parseInt(input.value, 10);

//   const userId = sessionStorage.getItem("userId");
//   const armazem_id = sessionStorage.getItem("armazem_id");

//   if (!quantidade || quantidade <= 0) {
//     alert("Quantidade inválida", "aviso");
//     return;
//   }

//   if (!userId || !armazem_id) {
//     alert("sessão expirada. Faz login novamente.");
//     return;
//   }

//   const produto = produtos.find((p) => p.id === id);

//   // verificar stock
//   if (!produto || quantidade > produto.stock) {
//     alert("Stock insuficiente", "erro");
//     return;
//   }

//   const utilizador_id = parseInt(userId, 10);
//   const armazemId = parseInt(armazem_id, 10);

//   if (Number.isNaN(utilizador_id) || Number.isNaN(armazemId)) {
//     alert("Dados inválidos", "erro");
//     return;
//   }

//   const btn = event.target;
//   btn.disabled = true;
//   btn.innerText = "A processar...";

//   try {
//     await comLoader(async () => {
//       const response = await fetch(`${baseAPI}/NovoConsumo`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           produto_id: id,
//           quantidade,
//           utilizador_id,
//           armazem_id: armazemId,
//         }),
//       });

//       if (response.ok) {
//         input.value = "";
//         await carregarProdutos();
//         alert("Consumo registado!");
//       } else {
//         const errorText = await response.text();
//         alert(errorText || "Erro ao registar consumo");
//       }
//     });
//   } catch (err) {
//     console.error(err);
//     alert("Erro ao registar consumo");
//   } finally {
//     btn.disabled = false;
//     btn.innerText = "Consumir";
//   }
// }
