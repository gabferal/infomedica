// Variables globales
let currentUser = null;

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

// Funciones de autenticación
async function loginUser(email, password) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al iniciar sesión');
        }
        
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userData', JSON.stringify(data.student));
        
        return data.student;
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

async function registerUser(name, email, password, studentId) {
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, email, password, studentId })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al registrarse');
        }
        
        return data;
    } catch (error) {
        console.error('Register error:', error);
        throw error;
    }
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
        
        const response = await fetch('/api/student', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al cargar datos');
        }
        
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
    
    // Actualizar lista de tareas (simplificado)
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
        formData.append('name', taskName);
        formData.append('assignment', file);
        
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Error al subir archivo');
        }
        
        return data;
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Login Form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            try {
                await loginUser(email, password);
                window.location.href = 'dashboard.html';
            } catch (error) {
                showMessage('loginMessage', error.message);
            }
        });
    }
    
    // Register Form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const studentId = document.getElementById('studentId').value;
            
            try {
                await registerUser(name, email, password, studentId);
                showMessage('registerMessage', 'Registro exitoso! Redirigiendo...', false);
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 2000);
            } catch (error) {
                showMessage('registerMessage', error.message);
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
                const taskName = document.getElementById('taskName').value;
                const file = fileInput.files[0];
                
                if (!file) {
                    showMessage('uploadMessage', 'Por favor selecciona un archivo');
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