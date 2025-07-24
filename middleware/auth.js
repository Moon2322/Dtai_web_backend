import jwt from 'jsonwebtoken';
import { db } from '../index.js';

export const verifyToken = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token de acceso requerido'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [sesiones] = await db.execute(
            'SELECT * FROM sesiones_usuario WHERE token_jwt = ? AND activa = TRUE AND fecha_expiracion > NOW()',
            [token]
        );

        if (sesiones.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Sesión expirada o inválida'
            });
        }

        req.user = decoded;
        req.token = token;
        next();

    } catch (error) {
        console.error('Error en verificación de token:', error);
        return res.status(401).json({
            success: false,
            message: 'Token inválido'
        });
    }
};

export const verifyTokenGeneral = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token de acceso requerido'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const [sesiones] = await db.execute(
            'SELECT * FROM sesiones_usuario WHERE token_jwt = ? AND activa = TRUE AND fecha_expiracion > NOW()',
            [token]
        );

        if (sesiones.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Sesión expirada o inválida'
            });
        }

        req.user = decoded;
        req.token = token;
        next();

    } catch (error) {
        console.error('Error en verificación de token:', error);
        return res.status(401).json({
            success: false,
            message: 'Token inválido'
        });
    }
};

export const publicRoute = (req, res, next) => {
    next();
};

export const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.rol)) {
            return res.status(403).json({
                success: false,
                message: 'Acceso denegado. Permisos insuficientes'
            });
        }
        next();
    };
};

// 👇 NUEVO MIDDLEWARE - Validar que el usuario sea profesor
export const validarProfesor = async (req, res, next) => {
    try {
        // Primero verificar el token
        await verifyToken(req, res, async () => {
            // Después verificar que sea profesor
            const [profesor] = await db.execute(
                'SELECT id FROM profesores WHERE usuario_id = (SELECT id FROM usuarios WHERE correo = ?)',
                [req.user.correo]
            );
            
            if (profesor.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: 'Acceso denegado. No eres un profesor registrado.'
                });
            }
            
            req.profesor_id = profesor[0].id;
            next();
        });
    } catch (error) {
        console.error('Error en validarProfesor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

export const verifyTokenEstudiante = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token de acceso requerido'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const [sesiones] = await db.execute(
            'SELECT * FROM sesiones_usuario WHERE token_jwt = ? AND activa = TRUE AND fecha_expiracion > NOW()',
            [token]
        );

        if (sesiones.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Sesión expirada o inválida'
            });
        }

        const userId = decoded.userId || decoded.id;
        
        const [alumnoInfo] = await db.execute(
            `SELECT 
                u.id as usuario_id,
                u.rol,
                a.id as alumno_id,
                a.matricula,
                a.carrera_id,
                a.cuatrimestre_actual
             FROM usuarios u
             INNER JOIN alumnos a ON u.id = a.usuario_id
             WHERE u.id = ?
             AND u.rol = 'alumno' AND u.activo = TRUE AND a.estado_alumno = 'activo'`,
            [userId]
        );

        if (alumnoInfo.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Acceso denegado. Usuario no es un estudiante activo'
            });
        }

        req.user = decoded;
        req.token = token;
        req.alumno = {
            usuario_id: alumnoInfo[0].usuario_id,
            alumno_id: alumnoInfo[0].alumno_id,
            matricula: alumnoInfo[0].matricula,
            carrera_id: alumnoInfo[0].carrera_id,
            cuatrimestre_actual: alumnoInfo[0].cuatrimestre_actual,
            rol: alumnoInfo[0].rol
        };

        next();

    } catch (error) {
        console.error('Error en verificación de token de estudiante:', error);
        return res.status(401).json({
            success: false,
            message: 'Token inválido'
        });
    }
};