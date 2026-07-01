/* 
 * Autor: Henrique de Carvalho <henriquecarvalho@usp.br>
 * 
 * Script do HashifyPass, usado para portar o hashify.js para um formulário de senhas.
 */

const passwordMinLength = 1;

function createHashifyDiv(loginFieldsDiv) {
  const hashifyDiv = document.createElement('div');
  hashifyDiv.setAttribute('id', 'hashifyDiv');
  loginFieldsDiv.append(hashifyDiv);
  hashifyDiv.style.display = 'none';
}

function displayHashifyDiv() {
  const hashifyDiv = document.getElementById('hashifyDiv');
  if (hashifyDiv.style.display === 'block') {
    hashifyDiv.style.display = 'none';
  }
  else {
    hashifyDiv.style.display = 'block';
    regenAnimation();
  }
}

/**
 * Essa função gera uma nova animação toda vez que as strings do nome de usuário ou da 
 * senha são modificadas no formulário
 * O nome de usuário é usado como salt para a criação da animação e a senha é usada
 * como hash
 */
function regenAnimation() {
  	const password = document.getElementById('passwordField').value;
    const username = document.getElementById('usernameField').value;
		const parent = "#hashifyDiv";
    if (document.getElementById('hashifyDiv').style.display === 'none') {
      return;
    }

		// Usuário vazio não carrega animação e password de tamanho menor
		// que o tamanho mínimo não carrega animação
		if (password.length < passwordMinLength || username === "") {
			$(parent).empty()
			return;
		}
	  console.log(password)

    const hashAlgorithm = "SHA-256";
    const animation = hashify.seed(hash=password, salt=username, hashAlgorithm, "TEXT");
    animation.prepAnimation(parent, [1, 4], [2, 2],
        { ...DEFAULT_OPTS,
          loop: 0, // Cria um loop infinito na animação
          x: 0,
          y: 0,
          masks: {
            ...DEFAULT_OPTS.masks,
            animate: true,
            thinLine: true,
            movingLine: true
        }
      });

    const tl = new mojs.Timeline();
    tl.add(animation.timeline);
    tl.play();
}

function jsSubmit(e) {
  e.preventDefault();
  window.location = "success.html";
  return false;
}

const loginFieldsDiv = document.getElementById('loginFields');
createHashifyDiv(loginFieldsDiv);
const hashifyButton = document.getElementById('hashifyPassButton');
hashifyButton.addEventListener('click', displayHashifyDiv);
const passField = document.getElementById('passwordField');
passField.addEventListener('input', regenAnimation);
const usernameField = document.getElementById('usernameField');
usernameField.addEventListener('input', regenAnimation);
