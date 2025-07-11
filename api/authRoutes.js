import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../index.js';

const router = express.Router();

router.post('/login', async (req, res) => {
    try {
        console.log('Headers:', req.headers);
        console.log('Body:', req.body);
        console.log('Content-Type:', req.headers['content-type']);
        
        const { correo, contraseña } = req.body;
        
        console.log('Correo recibido:', correo);
        console.log('Contraseña recibida:', '***');

        if (!correo || !contraseña) {
            console.log('❌ Faltan credenciales');
            return res.status(400).json({ 
                success: false, 
                message: 'Correo y contraseña son requeridos' 
            });
        }

        console.log('🔍 Buscando usuario en BD...');
        const [usuarios] = await db.execute(
            'SELECT * FROM usuarios WHERE correo = ? AND activo = TRUE',
            [correo]
        );

        console.log('👤 Usuarios encontrados:', usuarios.length);

        if (usuarios.length === 0) {
            console.log('❌ Usuario no encontrado');
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }

        const usuario = usuarios[0];
        console.log('✅ Usuario encontrado:', usuario.nombre, usuario.rol);
        const contraseñaValida = await bcrypt.compare(contraseña, usuario.contraseña);
        console.log('🔐 Contraseña válida:', contraseñaValida);
        
        if (!contraseñaValida) {
            console.log('❌ Contraseña incorrecta');
            return res.status(401).json({
                success: false,
                message: 'Credenciales inválidas'
            });
        }
        let infoAdicional = {};
        
        if (usuario.rol === 'alumno') {
            const [alumnos] = await db.execute(
                'SELECT * FROM alumnos WHERE usuario_id = ?',
                [usuario.id]
            );
            infoAdicional = alumnos[0] || {};
        } else if (usuario.rol === 'profesor') {
            const [profesores] = await db.execute(
                'SELECT * FROM profesores WHERE usuario_id = ?',
                [usuario.id]
            );
            infoAdicional = profesores[0] || {};
        } else if (usuario.rol === 'directivo') {
            const [directivos] = await db.execute(
                'SELECT * FROM directivos WHERE usuario_id = ?',
                [usuario.id]
            );
            infoAdicional = directivos[0] || {};
        }

        console.log('📋 Info adicional obtenida');
        const token = jwt.sign(
            { 
                userId: usuario.id, 
                rol: usuario.rol,
                correo: usuario.correo 
            },
            process.env.JWT_SECRET || 'tu_clave_secreta',
            { expiresIn: '24h' }
        );

        console.log('🔑 Token generado');
        const fechaExpiracion = new Date(Date.now() + 24 * 60 * 60 * 1000); 
        await db.execute(
            'INSERT INTO sesiones_usuario (usuario_id, token_jwt, fecha_expiracion) VALUES (?, ?, ?)',
            [usuario.id, token, fechaExpiracion]
        );

        console.log('Sesión guardada');

        res.json({
            success: true,
            message: 'Login exitoso',
            token,
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                correo: usuario.correo,
                rol: usuario.rol,
                avatar_url: usuario.avatar_url,
                ...infoAdicional
            }
        });

        console.log('✅ Login exitoso para:', usuario.correo);

    } catch (error) {
        console.error('❌ Error en login:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;