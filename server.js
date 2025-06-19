require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Configuración para Vercel
const app = express();

// Middlewares esenciales para Vercel
app.use(cors({
  origin: [
    'https://infomedica.vercel.app', 
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (necesario para Vercel)
app.use(express.static(path.join(__dirname, 'public')));

// Conexión optimizada para MongoDB Atlas
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });
    console.log('MongoDB conectado');
  } catch (err) {
    console.error('Error de conexión a MongoDB:', err.message);
    process.exit(1);
  }
};
connectDB();

// Configuración mejorada de Multer para Vercel
const storage = multer.memoryStorage(); // Usamos memoryStorage en lugar de disco
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // Límite de 5MB
  }
});

// Modelo de Estudiante optimizado
const StudentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email inválido']
  },
  password: { type: String, required: true, minlength: 6 },
  studentId: { type: String, required: true, unique: true, trim: true },
  assignments: [{
    _id: { type: String, default: () => uuidv4() },
    name: { type: String, required: true },
    fileName: { type: String, required: true },
    fileUrl: { type: String },
    submittedAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Middlewares del modelo
StudentSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

StudentSchema.methods.toJSON = function() {
  const student = this.toObject();
  delete student.password;
  delete student.__v;
  return student;
};

const Student = mongoose.model('Student', StudentSchema);

// Configuración mejorada de Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Middleware de autenticación mejorado
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Autenticación requerida' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const student = await Student.findOne({ _id: decoded._id }).select('-password');
    
    if (!student) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    
    req.student = student;
    req.token = token;
    next();
  } catch (err) {
    console.error('Error de autenticación:', err.message);
    res.status(401).json({ error: 'Por favor autentícate' });
  }
};

// Handler para manejar errores de forma consistente
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Rutas API
app.post('/api/register', asyncHandler(async (req, res) => {
  const { name, email, password, studentId } = req.body;
  
  const existingStudent = await Student.findOne({ $or: [{ email }, { studentId }] });
  if (existingStudent) {
    return res.status(409).json({ 
      error: 'El correo o número de identificación ya están registrados' 
    });
  }
  
  const student = new Student({ name, email, password, studentId });
  await student.save();
  
  await transporter.sendMail({
    to: email,
    from: `"Sistema Educativo" <${process.env.EMAIL_USER}>`,
    subject: 'Bienvenido al Sistema Educativo',
    html: `
      <h1 style="color: #0071e3;">Bienvenido, ${name}!</h1>
      <p>Tu cuenta ha sido creada exitosamente.</p>
      <p>Ahora puedes iniciar sesión en nuestra plataforma.</p>
    `
  });
  
  res.status(201).json({ 
    success: true,
    message: 'Usuario registrado exitosamente',
    student: student.toJSON()
  });
}));

app.post('/api/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  
  const student = await Student.findOne({ email });
  if (!student) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  
  const isMatch = await bcrypt.compare(password, student.password);
  if (!isMatch) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  
  const token = jwt.sign({ _id: student._id }, process.env.JWT_SECRET, { 
    expiresIn: '7d' 
  });
  
  res.json({ 
    success: true,
    token,
    student: student.toJSON()
  });
}));

app.post('/api/upload', authenticate, upload.single('assignment'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Por favor sube un archivo' });
  }
  
  const { name } = req.body;
  const fileBuffer = req.file.buffer;
  const fileName = `${uuidv4()}-${req.file.originalname}`;
  
  // Aquí deberías subir el archivo a un servicio como AWS S3, Google Cloud Storage, etc.
  // Para Vercel, puedes considerar usar Vercel Blob o un servicio similar
  // Esto es un ejemplo simplificado:
  const fileUrl = `https://tu-app.vercel.app/uploads/${fileName}`;
  
  req.student.assignments.push({ 
    name, 
    fileName,
    fileUrl
  });
  
  await req.student.save();
  
  await transporter.sendMail({
    to: [req.student.email, process.env.EMAIL_USER],
    from: `"Sistema Educativo" <${process.env.EMAIL_USER}>`,
    subject: '✅ Nueva tarea enviada',
    html: `
      <h2 style="color: #0071e3;">Nueva tarea enviada</h2>
      <p><strong>Estudiante:</strong> ${req.student.name}</p>
      <p><strong>Tarea:</strong> ${name}</p>
      <p><strong>Archivo:</strong> <a href="${fileUrl}">${fileName}</a></p>
      <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
    `
  });
  
  res.json({ 
    success: true,
    message: 'Tarea enviada exitosamente',
    fileUrl
  });
}));

app.get('/api/student', authenticate, asyncHandler(async (req, res) => {
  res.json({ 
    success: true,
    student: req.student 
  });
}));

// Middleware para manejar 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint no encontrado' });
});

// Middleware para manejar errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Algo salió mal en el servidor',
    message: err.message 
  });
});

// Exportamos la app para Vercel
module.exports = app;

// Solo iniciamos el servidor si no estamos en entorno Vercel
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}
