import express from 'express';
import { db } from '../index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/tutores/profesores', verifyToken, async (req, res) => {
    try {
        const [profesores] = await db.execute(`
            SELECT p.id, p.numero_empleado, u.nombre, u.apellido, c.nombre as carrera_nombre
            FROM profesores p
            INNER JOIN usuarios u ON p.usuario_id = u.id
            INNER JOIN carreras c ON p.carrera_id = c.id
            WHERE p.activo = TRUE AND u.activo = TRUE
            ORDER BY u.apellido, u.nombre
        `);
        
        res.json({
            success: true,
            data: profesores
        });
    } catch (error) {
        console.error('Error al obtener profesores:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/tutores/grupos', verifyToken, async (req, res) => {
    try {
        const [grupos] = await db.execute(`
            SELECT g.id, g.codigo, g.cuatrimestre, g.ciclo_escolar, g.periodo, g.año,
                   c.nombre as carrera_nombre, g.capacidad_maxima,
                   COUNT(ag.alumno_id) as estudiantes_inscritos
            FROM grupos g
            INNER JOIN carreras c ON g.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON g.id = ag.grupo_id AND ag.activo = TRUE
            WHERE g.activo = TRUE
            GROUP BY g.id, g.codigo, g.cuatrimestre, g.ciclo_escolar, g.periodo, g.año, 
                     c.nombre, g.capacidad_maxima
            ORDER BY c.nombre, g.cuatrimestre, g.codigo
        `);
        
        res.json({
            success: true,
            data: grupos
        });
    } catch (error) {
        console.error('Error al obtener grupos:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/tutores/asignaciones', verifyToken, async (req, res) => {
    try {
        const [asignaciones] = await db.execute(`
            SELECT 
                p.id as profesor_id,
                p.numero_empleado,
                CONCAT(u.nombre, ' ', u.apellido) as profesor_nombre,
                c.nombre as carrera_profesor,
                GROUP_CONCAT(g.id) as grupos,
                COUNT(g.id) as total_grupos,
                GROUP_CONCAT(CONCAT(g.codigo, ' (', car.nombre, ' - Cuatri ', g.cuatrimestre, ')') SEPARATOR '|') as grupos_detalle
            FROM profesores p
            INNER JOIN usuarios u ON p.usuario_id = u.id
            INNER JOIN carreras c ON p.carrera_id = c.id
            INNER JOIN grupos g ON p.id = g.profesor_tutor_id
            INNER JOIN carreras car ON g.carrera_id = car.id
            WHERE p.activo = TRUE AND u.activo = TRUE AND g.activo = TRUE
            GROUP BY p.id, p.numero_empleado, u.nombre, u.apellido, c.nombre
            ORDER BY u.apellido, u.nombre
        `);
        
        res.json({
            success: true,
            data: asignaciones
        });
    } catch (error) {
        console.error('Error al obtener asignaciones:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.post('/tutores/asignar', verifyToken, async (req, res) => {
    try {
        const { profesor_id, grupos } = req.body;
        
        if (!profesor_id || !grupos || grupos.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Profesor y grupos son requeridos'
            });
        }

        const [profesor] = await db.execute(
            'SELECT id FROM profesores WHERE id = ? AND activo = TRUE',
            [profesor_id]
        );

        if (profesor.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Profesor no encontrado'
            });
        }

        const [gruposOcupados] = await db.execute(
            `SELECT codigo FROM grupos WHERE id IN (${grupos.map(() => '?').join(',')}) AND profesor_tutor_id IS NOT NULL`,
            grupos
        );

        if (gruposOcupados.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Los siguientes grupos ya tienen tutor asignado: ${gruposOcupados.map(g => g.codigo).join(', ')}`
            });
        }

        await db.execute(
            `UPDATE grupos SET profesor_tutor_id = ? WHERE id IN (${grupos.map(() => '?').join(',')})`,
            [profesor_id, ...grupos]
        );

        res.json({
            success: true,
            message: 'Tutor asignado exitosamente'
        });
    } catch (error) {
        console.error('Error al asignar tutor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.put('/tutores/actualizar/:profesor_id', verifyToken, async (req, res) => {
    try {
        const { profesor_id } = req.params;
        const { grupos } = req.body;
        
        if (!grupos || grupos.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Se requiere al menos un grupo'
            });
        }

        await db.execute(
            'UPDATE grupos SET profesor_tutor_id = NULL WHERE profesor_tutor_id = ?',
            [profesor_id]
        );

        const [gruposOcupados] = await db.execute(
            `SELECT codigo FROM grupos WHERE id IN (${grupos.map(() => '?').join(',')}) AND profesor_tutor_id IS NOT NULL`,
            grupos
        );

        if (gruposOcupados.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Los siguientes grupos ya tienen tutor asignado: ${gruposOcupados.map(g => g.codigo).join(', ')}`
            });
        }

        await db.execute(
            `UPDATE grupos SET profesor_tutor_id = ? WHERE id IN (${grupos.map(() => '?').join(',')})`,
            [profesor_id, ...grupos]
        );

        res.json({
            success: true,
            message: 'Asignación actualizada exitosamente'
        });
    } catch (error) {
        console.error('Error al actualizar asignación:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.delete('/tutores/remover/:profesor_id', verifyToken, async (req, res) => {
    try {
        const { profesor_id } = req.params;
        
        await db.execute(
            'UPDATE grupos SET profesor_tutor_id = NULL WHERE profesor_tutor_id = ?',
            [profesor_id]
        );

        res.json({
            success: true,
            message: 'Asignaciones removidas exitosamente'
        });
    } catch (error) {
        console.error('Error al remover asignaciones:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;