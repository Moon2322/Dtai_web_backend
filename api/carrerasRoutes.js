import express from 'express';
import { db } from '../index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Usar middleware en todas las rutas
router.use(verifyToken);

// Obtener todas las carreras activas
router.get('/', async (req, res) => {
    try {
        const [carreras] = await db.execute(`
            SELECT 
                id, 
                nombre, 
                codigo, 
                activa,
                duracion_cuatrimestres,
                area_conocimiento
            FROM carreras 
            WHERE activa = 1
            ORDER BY nombre
        `);

        res.json({
            success: true,
            data: carreras
        });

    } catch (error) {
        console.error('Error al obtener carreras:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener carrera por ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const [carrera] = await db.execute(`
            SELECT 
                id, 
                nombre, 
                codigo, 
                activa,
                duracion_cuatrimestres,
                area_conocimiento
            FROM carreras 
            WHERE id = ? AND activa = 1
        `, [id]);

        if (carrera.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Carrera no encontrada'
            });
        }

        res.json({
            success: true,
            data: carrera[0]
        });

    } catch (error) {
        console.error('Error al obtener carrera:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener estadísticas de una carrera
router.get('/:id/estadisticas', async (req, res) => {
    try {
        const { id } = req.params;

        // Total de estudiantes
        const [totalEstudiantes] = await db.execute(`
            SELECT COUNT(*) as total
            FROM alumnos 
            WHERE carrera_id = ? AND estado_alumno = 'activo'
        `, [id]);

        // Estudiantes por cuatrimestre
        const [porCuatrimestre] = await db.execute(`
            SELECT 
                cuatrimestre_actual,
                COUNT(*) as cantidad
            FROM alumnos 
            WHERE carrera_id = ? AND estado_alumno = 'activo'
            GROUP BY cuatrimestre_actual
            ORDER BY cuatrimestre_actual
        `, [id]);

        // Promedio general de la carrera
        const [promedioCarrera] = await db.execute(`
            SELECT AVG(promedio_general) as promedio
            FROM alumnos 
            WHERE carrera_id = ? 
            AND estado_alumno = 'activo' 
            AND promedio_general > 0
        `, [id]);

        res.json({
            success: true,
            data: {
                total_estudiantes: totalEstudiantes[0].total,
                por_cuatrimestre: porCuatrimestre,
                promedio_carrera: promedioCarrera[0].promedio ? parseFloat(promedioCarrera[0].promedio).toFixed(2) : '0.00'
            }
        });

    } catch (error) {
        console.error('Error al obtener estadísticas de carrera:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;