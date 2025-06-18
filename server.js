require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();

// Configuración
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Conexión a MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Conectado a MongoDB Atlas'))
.catch(err => console.error('Error de conexión:', err));

// Modelos
const StudentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    studentId: { type: String, required: true, unique: true },
    assignments: [{
        name: String,
        fileName: String,
        submittedAt: { type: Date, default: Date.now }
    }]
});

// Hash de contraseña antes de guardar
StudentSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

const Student = mongoose.model('Student', StudentSchema);

// Configuración de Multer para subida de archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public', 'uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

// Configuración de Nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Middleware de autenticación
const authenticate = async (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const student = await Student.findOne({ _id: decoded._id });
        
        if (!student) {
            throw new Error();
        }
        
        req.student = student;
        req.token = token;
        next();
    } catch (err) {
        res.status(401).send({ error: 'Por favor autentícate' });
    }
};

// Rutas
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, studentId } = req.body;
        
        // Verificar si el estudiante ya existe
        const existingStudent = await Student.findOne({ $or: [{ email }, { studentId }] });
        if (existingStudent) {
            return res.status(400).send({ error: 'El correo o número de identificación ya están registrados' });
        }
        
        const student = new Student({ name, email, password, studentId });
        await student.save();
        
        // Enviar email de confirmación
        await transporter.sendMail({
            to: email,
            from: process.env.EMAIL_USER,
            subject: 'Bienvenido al Sistema Educativo',
            html: `<h1>Bienvenido, ${name}</h1><p>Tu cuenta ha sido creada exitosamente.</p>`
        });
        
        res.status(201).send({ message: 'Usuario registrado exitosamente' });
    } catch (err) {
        res.status(400).send({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const student = await Student.findOne({ email });
        
        if (!student) {
            return res.status(400).send({ error: 'Credenciales inválidas' });
        }
        
        const isMatch = await bcrypt.compare(password, student.password);
        if (!isMatch) {
            return res.status(400).send({ error: 'Credenciales inválidas' });
        }
        
        const token = jwt.sign({ _id: student._id }, process.env.JWT_SECRET);
        res.send({ student, token });
    } catch (err) {
        res.status(400).send({ error: err.message });
    }
});

app.post('/api/upload', authenticate, upload.single('assignment'), async (req, res) => {
    try {
        const { name } = req.body;
        const { filename } = req.file;
        
        req.student.assignments.push({ name, fileName: filename });
        await req.student.save();
        
        // Enviar notificación por email
        await transporter.sendMail({
            to: [req.student.email, process.env.EMAIL_USER],
            from: process.env.EMAIL_USER,
            subject: 'Nueva tarea enviada',
            html: `
                <h1>Nueva tarea enviada</h1>
                <p>El estudiante ${req.student.name} ha enviado una nueva tarea.</p>
                <p><strong>Tarea:</strong> ${name}</p>
                <p><strong>Archivo:</strong> ${filename}</p>
            `
        });
        
        res.send({ message: 'Tarea enviada exitosamente' });
    } catch (err) {
        res.status(400).send({ error: err.message });
    }
});

app.get('/api/student', authenticate, async (req, res) => {
    res.send(req.student);
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});