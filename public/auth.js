



function getPasswordErrors(password) {
    const errors = [];

    if (password.length < 12) {
        errors.push("at least 12 characters");
    }
    if (!/[A-Z]/.test(password)) {
        errors.push("one uppercase letter");
    }
    if (!/[a-z]/.test(password)) {
        errors.push("one lowercase letter");
    }
    if (!/[0-9]/.test(password)) {
        errors.push("one number");
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
        errors.push("one special character");
    }

    return errors;
}

function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show", "error");

    setTimeout(() => {
        toast.classList.remove("show", "error");
    }, 3000);
}

const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = document.getElementById("loginEmail").value.trim();
        const password = document.getElementById("loginPassword").value.trim();

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();
            if (!res.ok) {
                alert(data.message || "Login failed");
                return;
            }
            // save token to local storage
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            // redirect to index
            window.location.href = "/";
        } catch (err) {
            console.error("Error during login:", err);
            alert("server error during login");
        }
    });
}

const passwordInput = document.getElementById("password");
const registerBtn = document.getElementById("registerBtn");
const passwordHint = document.getElementById("passwordHint");

const rules = {
    length: document.getElementById("rule-length"),
    upper: document.getElementById("rule-upper"),
    lower: document.getElementById("rule-lower"),
    number: document.getElementById("rule-number"),
    special: document.getElementById("rule-special"),
};

const updatePasswordUI = () => {
    const password = passwordInput.value;

    const checks = {
        length: password.length >= 12,
        upper: /[A-Z]/.test(password),
        lower: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
    };

    let isValid = true;

    Object.keys(checks).forEach((key) => {
        if (!rules[key]) return;

        if (checks[key]) {
            rules[key].classList.add("valid");
        } else {
            rules[key].classList.remove("valid");
            isValid = false;
        }
    });

    passwordHint.style.display = isValid ? "none" : "block";
    registerBtn.disabled = !isValid;
};

if (passwordInput && registerBtn) {
    passwordInput.addEventListener("input", updatePasswordUI);
    updatePasswordUI(); // run once on page load
}

// register user function
const registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document.getElementById("name").value.trim();
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value.trim();

        const passwordErrors = getPasswordErrors(password);

        if (passwordErrors.length > 0) {
            showToast(
                "Password must contain: " + passwordErrors.join(", ")
            );
            return;
        }

        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name, email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "Registration failed");
                return;
            }

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));

            window.location.href = "/";
        } catch (err) {
            console.error(err);
            alert("Server error during registration");
        }
    });
}

// logout function
function logout() {
    // Clear auth data
    localStorage.clear();
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    // Optional: clear everything
    // localStorage.clear();

    // Redirect to login
    window.location.href = '/login.html';
}

const togglePassword = document.querySelector('#togglePassword');

if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', function (e) {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);

        this.classList.toggle('fa-eye');
        this.classList.toggle('fa-eye-slash');
    });
}