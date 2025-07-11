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

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_clave_secreta');
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