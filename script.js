// Constantes de configuración
const API_BASE_URL = http://infomedica.vercel.app; // Usa la URL actual para Vercel
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 segundo

// Variables de estado
let currentUser = null;
let isRequestInProgress = false;

// ==================== FUNCIONES DE UTILIDAD ====================

/**
 * Muestra mensajes de feedback al usuario
 * @param {string} elementId - ID del elemento donde mostrar el mensaje
 * @param {string} message - Mensaje a mostrar
 * @param {boolean} isError - Si es mensaje de error (true) o éxito (false)
 * @param {number} timeout - Tiempo en ms para ocultar el mensaje (0 para permanecer)
 */
function showMessage(elementId, message, isError = true, timeout = 5000) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`Elemento ${elementId} no encontrado para mostrar mensaje`);
        return;
    }
    
    element.innerHTML = message;
    element.style.display = 'block';
    element.style.backgroundColor = isError ? 'rgba(255, 59, 48, 0.1)' : 'rgba(52, 199, 89, 0.1)';
    element.style.color = isError ? '#FF3B30' : '#34C759';
    element.style.padding = '12px';
    element.style.borderRadius = '8px';
    element.style.margin = '12px 0';
    element.style.transition = 'opacity 0.3s ease';
    
    if (timeout > 0) {
        setTimeout(() => {
            element.style.opacity = '0';
            setTimeout(() => {
                element.style.display = 'none';
                element.style.opacity = '1';
            }, 300);
        }, timeout);
    }
}

/**
 * Muestra u oculta un indicador de carga
 * @param {string} elementId - ID del contenedor
 * @param {boolean} show - Mostrar u ocultar
 */
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

/**
 * Habilita/deshabilita elementos de un formulario
 * @param {string} formId - ID del formulario
 * @param {boolean} disabled - Si deshabilitar o no
 */
function toggleFormElements(formId, disabled) {
    const form = document.getElementById(formId);
    if (!form) return;
    
    const elements = form.querySelectorAll('button, input, textarea, select');
    elements.forEach(el => {
        el.disabled = disabled;
        el.style.opacity = disabled ? 0.7 : 1;
    });
}

// ==================== VALIDACIONES ====================

function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).toLowerCase());
}

function validatePassword(password) {
    return password.length >= 8;
}

function validateStudentId(studentId) {
    return studentId.trim().length >= 5;
}

// ==================== MANEJO DE API ====================

/**
 * Maneja solicitudes API con reintentos
 * @param {string} endpoint - Endpoint de la API (sin /api/)
 * @param {object} options - Opciones de fetch
 * @param {string} errorMessage - Mensaje de error genérico
 * @returns {Promise} - Promesa con la respuesta
 */
async function apiRequest(endpoint, options = {}, errorMessage = 'Error en la solicitud') {
    let retryCount = 0;
    const url = `${API_BASE_URL}/api/${endpoint}`;
    
    while (retryCount < MAX_RETRIES) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                // Si es error 401 (no autorizado), redirigir a login
                if (response.status === 401) {
                    localStorage.removeItem('authToken');
                    localStorage.removeItem('userData');
                    window.location.href = 'login.html';
                    return;
                }
                
                throw new Error(data.message || errorMessage);
            }
            
            return data;
        } catch (error) {
            retryCount++;
            
            if (retryCount >= MAX_RETRIES) {
                console.error(`API request failed after ${MAX_RETRIES} attempts:`, error);
                throw error;
            }
            
            // Esperar con retraso exponencial
            await new Promise(resolve => 
                setTimeout(resolve, RETRY_DELAY * Math.pow(2, retryCount))
            );
        }
    }
}

// ==================== AUTENTICACIÓN ====================

async function loginUser(email, password) {
    if (!validateEmail(email)) {
        throw new Error('Por favor ingresa un email válido');
    }
    
    if (!validatePassword(password)) {
        throw new Error('La contraseña debe tener al menos 8 caracteres');
    }

    return apiRequest(
        'login',
        {
            method: 'POST',
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

    if (!validateStudentId(userData.studentId)) {
        throw new Error('El número de identificación debe tener al menos 5 caracteres');
    }

    return apiRequest(
        'register',
        {
            method: 'POST',
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

// ==================== DASHBOARD ====================

async function loadUserData() {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }
        
        const data = await apiRequest(
            'student',
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
                    <a href="${assignment.fileUrl}" download target="_blank">
                        <i class="fas fa-download"></i> Descargar
                    </a>
                </span>
            </li>
        `).join('') || '<li class="file-item">No hay tareas enviadas</li>';
    }
}

async function uploadAssignment(taskName, file) {
    const token = localStorage.getItem('authToken');
    if (!token) {
        throw new Error('No autenticado');
    }
    
    const formData = new FormData();
    formData.append('name', taskName.trim());
    formData.append('assignment', file);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Error al subir archivo');
        }
        
        return data;
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

// ==================== MANEJO DE FORMULARIOS ====================

function setupFormValidation() {
    // Validación en tiempo real para todos los formularios
    document.querySelectorAll('input[type="email"]').forEach(input => {
        input.addEventListener('input', () => {
            input.classList.toggle('invalid', input.value && !validateEmail(input.value));
        });
    });
    
    document.querySelectorAll('input[type="password"]').forEach(input => {
        input.addEventListener('input', () => {
            input.classList.toggle('invalid', input.value && !validatePassword(input.value));
        });
    });
    
    document.querySelectorAll('input[id="studentId"]').forEach(input => {
        input.addEventListener('input', () => {
            input.classList.toggle('invalid', input.value && !validateStudentId(input.value));
        });
    });
}

function setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isRequestInProgress) return;
        
        isRequestInProgress = true;
        toggleFormElements('loginForm', true);
        showLoading('loginLoading', true);
        showMessage('loginMessage', '', false, 0); // Limpiar mensajes
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        try {
            const { token, student } = await loginUser(email, password);
            localStorage.setItem('authToken', token);
            localStorage.setItem('userData', JSON.stringify(student));
            
            showMessage('loginMessage', '✓ Inicio de sesión exitoso. Redirigiendo...', false, 1500);
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 1500);
        } catch (error) {
            showMessage('loginMessage', `✗ ${error.message}`);
        } finally {
            isRequestInProgress = false;
            toggleFormElements('loginForm', false);
            showLoading('loginLoading', false);
        }
    });
}

function setupRegisterForm() {
    const registerForm = document.getElementById('registerForm');
    if (!registerForm) return;
    
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isRequestInProgress) return;
        
        isRequestInProgress = true;
        toggleFormElements('registerForm', true);
        showLoading('registerLoading', true);
        showMessage('registerMessage', '', false, 0);
        
        const userData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            studentId: document.getElementById('studentId').value
        };
        
        try {
            await registerUser(userData);
            showMessage('registerMessage', '✓ Registro exitoso! Redirigiendo al login...', false, 3000);
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 3000);
        } catch (error) {
            showMessage('registerMessage', `✗ ${error.message}`);
        } finally {
            isRequestInProgress = false;
            toggleFormElements('registerForm', false);
            showLoading('registerLoading', false);
        }
    });
}

function setupUploadForm() {
    const uploadForm = document.getElementById('uploadForm');
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileName = document.getElementById('fileName');
    
    if (!uploadForm || !dropZone || !fileInput || !fileName) return;
    
    // Configurar drag and drop
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
    
    uploadForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isRequestInProgress) return;
        
        isRequestInProgress = true;
        toggleFormElements('uploadForm', true);
        showLoading('uploadLoading', true);
        showMessage('uploadMessage', '', false, 0);
        
        const taskName = document.getElementById('taskName').value;
        const file = fileInput.files[0];
        
        if (!file) {
            showMessage('uploadMessage', '✗ Por favor selecciona un archivo');
            isRequestInProgress = false;
            toggleFormElements('uploadForm', false);
            showLoading('uploadLoading', false);
            return;
        }
        
        try {
            await uploadAssignment(taskName, file);
            showMessage('uploadMessage', '✓ Tarea enviada exitosamente!', false, 5000);
            uploadForm.reset();
            fileName.textContent = '';
            await loadUserData(); // Recargar datos
        } catch (error) {
            showMessage('uploadMessage', `✗ ${error.message}`);
        } finally {
            isRequestInProgress = false;
            toggleFormElements('uploadForm', false);
            showLoading('uploadLoading', false);
        }
    });
}

// ==================== INICIALIZACIÓN ====================

function init() {
    // Añadir estilos dinámicos
    const style = document.createElement('style');
    style.textContent = `
        .invalid {
            border-color: #FF3B30 !important;
        }
        .spinner {
            border: 3px solid rgba(0, 113, 227, 0.1);
            border-radius: 50%;
            border-top: 3px solid #0071e3;
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
    
    // Configurar formularios
    setupFormValidation();
    setupLoginForm();
    setupRegisterForm();
    
    // Configurar dashboard si es necesario
    if (window.location.pathname.includes('dashboard.html')) {
        // Configurar botón de logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', logoutUser);
        }
        
        setupUploadForm();
        loadUserData();
    }
}

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', init);
