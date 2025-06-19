// Variables globales
let currentUser = null;
let isRequestInProgress = false;

// Funciones de utilidad
function showMessage(elementId, message, isError = true) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = message;
    element.style.display = 'block';
    element.style.backgroundColor = isError ? 'rgba(255, 59, 48, 0.1)' : 'rgba(52, 199, 89, 0.1)';
    element.style.color = isError ? '#FF3B30' : '#34C759';
    element.style.padding = '10px';
    element.style.borderRadius = '8px';
    element.style.margin = '10px 0';
    
    if (!isError) {
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

function showLoading(elementId, show = true) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    if (show) {
        element.innerHTML = '<div class="spinner"></div>';
        element.style.display = 'block';
    } else {
        element.innerHTML = '';
        element.style.display = 'none';
    }
}

function toggleFormElements(formId, disabled) {
    const form = document.getElementById(formId);
    if (!form) return;
    
    const elements = form.querySelectorAll('button, input, textarea, select');
    elements.forEach(el => {
        el.disabled = disabled;
    });
}

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

function validatePassword(password) {
    return password.length >= 8;
}

// Manejo centralizado de solicitudes API
async function handleApiRequest(url, options, errorMessage, maxRetries = 3) {
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
        try {
            const response = await fetch(url, options);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || errorMessage);
            }
            
            return await response.json();
        } catch (error) {
            retryCount++;
            if (retryCount >= maxRetries) {
                console.error('API request failed:', error);
                throw error;
            }
            
            // Esperar antes de reintentar (con retraso exponencial)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
        }
    }
}

// Funciones de autenticación
async function loginUser(email, password) {
    if (!validateEmail(email)) {
        throw new Error('Por favor ingresa un email válido');
    }
    
    if (!validatePassword(password)) {
        throw new Error('La contraseña debe tener al menos 8 caracteres');
    }

    return handleApiRequest(
        '/api/login',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: email.trim(),
                password: password
            })
        },
        'Error al iniciar sesión'
    );
}

async function registerUser(userData) {
    if (!validateEmail(userData.email)) {
        throw new Error('Por favor ingresa un email válido');
    }
    
    if (!validatePassword(userData.password)) {
        throw new Error('La contraseña debe tener al menos 8 caracteres');
    }

    return handleApiRequest(
        'http://localhost:3000/api/register',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: userData.name.trim(),
                email: userData.email.trim(),
                password: userData.password,
                studentId: userData.studentId.trim()
            })
        },
        'Error en el registro'
    );
}

function logoutUser() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    window.location.href = 'login.html';
}

// Funciones del dashboard
async function loadUserData() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }
        
        const data = await handleApiRequest(
            '/api/student',
            {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            },
            'Error al cargar datos'
        );
        
        currentUser = data;
        updateUI();
    } catch (error) {
        console.error('Error loading user data:', error);
        window.location.href = 'login.html';
    }
}

function updateUI() {
    if (!currentUser) return;
    
    // Actualizar nombre de usuario
    const userNameElements = document.querySelectorAll('#userName, #welcomeMessage');
    userNameElements.forEach(el => {
        el.textContent = `Hola, ${currentUser.name}`;
    });
    
    // Actualizar lista de tareas
    const taskList = document.getElementById('taskList');
    if (taskList) {
        taskList.innerHTML = currentUser.assignments.map(assignment => `
            <li class="file-item">
                <span>${assignment.name}</span>
                <span class="file-actions">
                    <a href="/uploads/${assignment.fileName}" download><i class="fas fa-download"></i> Descargar</a>
                </span>
            </li>
        `).join('');
    }
}

async function uploadAssignment(taskName, file) {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            throw new Error('No autenticado');
        }
        
        const formData = new FormData();
        formData.append('name', taskName.trim());
        formData.append('assignment', file);
        
        return handleApiRequest(
            '/api/upload',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            },
            'Error al subir archivo'
        );
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

// Validación en tiempo real
function setupRealTimeValidation() {
    // Validación de email
    const emailInputs = document.querySelectorAll('input[type="email"]');
    emailInputs.forEach(input => {
        input.addEventListener('input', () => {
            if (input.value && !validateEmail(input.value)) {
                input.classList.add('invalid');
            } else {
                input.classList.remove('invalid');
            }
        });
    });
    
    // Validación de contraseña
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
        input.addEventListener('input', () => {
            if (input.value && !validatePassword(input.value)) {
                input.classList.add('invalid');
            } else {
                input.classList.remove('invalid');
            }
        });
    });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    setupRealTimeValidation();
    
    // Login Form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isRequestInProgress) return;
            
            isRequestInProgress = true;
            toggleFormElements('loginForm', true);
            showLoading('loginLoading');
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                const user = await loginUser(email, password);
                localStorage.setItem('authToken', user.token);
                localStorage.setItem('userData', JSON.stringify(user.student));
                window.location.href = 'dashboard.html';
            } catch (error) {
                showMessage('loginMessage', error.message);
            } finally {
                isRequestInProgress = false;
                toggleFormElements('loginForm', false);
                showLoading('loginLoading', false);
            }
        });
    }
    
    // Register Form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (isRequestInProgress) return;
            
            isRequestInProgress = true;
            toggleFormElements('registerForm', true);
            showLoading('registerLoading');
            
            const userData = {
                name: document.getElementById('name').value,
                email: document.getElementById('email').value,
                password: document.getElementById('password').value,
                studentId: document.getElementById('studentId').value
            };
            
            try {
                await registerUser(userData);
                showMessage('registerMessage', 'Registro exitoso! Redirigiendo...', false);
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            } catch (error) {
                showMessage('registerMessage', error.message);
            } finally {
                isRequestInProgress = false;
                toggleFormElements('registerForm', false);
                showLoading('registerLoading', false);
            }
        });
    }
    
    // Logout Button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logoutUser);
    }
    
    // Dashboard
    if (window.location.pathname.includes('dashboard.html')) {
        loadUserData();
        
        // Upload Form
        const uploadForm = document.getElementById('uploadForm');
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const fileName = document.getElementById('fileName');
        
        if (uploadForm) {
            uploadForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (isRequestInProgress) return;
                
                isRequestInProgress = true;
                toggleFormElements('uploadForm', true);
                showLoading('uploadLoading');
                
                const taskName = document.getElementById('taskName').value;
                const file = fileInput.files[0];
                
                if (!file) {
                    showMessage('uploadMessage', 'Por favor selecciona un archivo');
                    isRequestInProgress = false;
                    toggleFormElements('uploadForm', false);
                    showLoading('uploadLoading', false);
                    return;
                }
                
                try {
                    await uploadAssignment(taskName, file);
                    showMessage('uploadMessage', 'Tarea enviada exitosamente!', false);
                    uploadForm.reset();
                    fileName.textContent = '';
                    await loadUserData(); // Recargar datos
                } catch (error) {
                    showMessage('uploadMessage', error.message);
                } finally {
                    isRequestInProgress = false;
                    toggleFormElements('uploadForm', false);
                    showLoading('uploadLoading', false);
                }
            });
        }
        
        // Drag and Drop
        if (dropZone) {
            dropZone.addEventListener('click', () => fileInput.click());
            
            fileInput.addEventListener('change', () => {
                if (fileInput.files.length) {
                    fileName.textContent = fileInput.files[0].name;
                }
            });
            
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = '#0071e3';
            });
            
            dropZone.addEventListener('dragleave', () => {
                dropZone.style.borderColor = 'rgba(0, 0, 0, 0.1)';
            });
            
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.style.borderColor = 'rgba(0, 0, 0, 0.1)';
                
                if (e.dataTransfer.files.length) {
                    fileInput.files = e.dataTransfer.files;
                    fileName.textContent = e.dataTransfer.files[0].name;
                }
            });
        }
    }
});

// Estilos para validación en tiempo real
const style = document.createElement('style');
style.textContent = `
    .invalid {
        border-color: #FF3B30 !important;
    }
    .spinner {
        border: 4px solid rgba(0, 0, 0, 0.1);
        border-radius: 50%;
        border-top: 4px solid #0071e3;
        width: 24px;
        height: 24px;
        animation: spin 1s linear infinite;
        margin: 0 auto;
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);
