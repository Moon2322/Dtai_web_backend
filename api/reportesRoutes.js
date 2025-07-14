import express from 'express';
import { db } from '../index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();
router.get('/reportes/estudiantes-activos', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN a.estado_alumno = 'activo' THEN 1 ELSE 0 END) as activos,
                SUM(CASE WHEN a.estado_alumno = 'baja_temporal' THEN 1 ELSE 0 END) as baja_temporal,
                SUM(CASE WHEN a.estado_alumno = 'egresado' THEN 1 ELSE 0 END) as egresados,
                SUM(CASE WHEN a.estado_alumno = 'baja_definitiva' THEN 1 ELSE 0 END) as baja_definitiva
            FROM alumnos a
            INNER JOIN usuarios u ON a.usuario_id = u.id
            WHERE u.activo = TRUE
        `);
        
        res.json(rows[0]);
    } catch (error) {
        console.error('Error al obtener estudiantes activos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/reportes/rendimiento-asignaturas', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                a.nombre as asignatura,
                a.codigo,
                c.nombre as carrera,
                COUNT(cal.id) as total_calificaciones,
                AVG(cal.calificacion_final) as promedio_general,
                SUM(CASE WHEN cal.estatus = 'aprobado' THEN 1 ELSE 0 END) as aprobados,
                SUM(CASE WHEN cal.estatus = 'reprobado' THEN 1 ELSE 0 END) as reprobados,
                SUM(CASE WHEN cal.estatus = 'extraordinario' THEN 1 ELSE 0 END) as extraordinarios,
                ROUND((SUM(CASE WHEN cal.estatus = 'aprobado' THEN 1 ELSE 0 END) * 100.0 / COUNT(cal.id)), 2) as porcentaje_aprobacion
            FROM asignaturas a
            INNER JOIN carreras c ON a.carrera_id = c.id
            LEFT JOIN calificaciones cal ON a.id = cal.asignatura_id
            WHERE a.activa = TRUE AND cal.calificacion_final IS NOT NULL
            GROUP BY a.id, a.nombre, a.codigo, c.nombre
            ORDER BY porcentaje_aprobacion DESC
        `);
        
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener rendimiento por asignaturas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/reportes/indices-reprobacion', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                c.nombre as carrera,
                COUNT(cal.id) as total_evaluaciones,
                SUM(CASE WHEN cal.estatus = 'reprobado' THEN 1 ELSE 0 END) as reprobados,
                SUM(CASE WHEN cal.estatus = 'extraordinario' THEN 1 ELSE 0 END) as extraordinarios,
                ROUND((SUM(CASE WHEN cal.estatus = 'reprobado' THEN 1 ELSE 0 END) * 100.0 / COUNT(cal.id)), 2) as porcentaje_reprobacion,
                ROUND((SUM(CASE WHEN cal.estatus = 'extraordinario' THEN 1 ELSE 0 END) * 100.0 / COUNT(cal.id)), 2) as porcentaje_extraordinario
            FROM carreras c
            INNER JOIN asignaturas a ON c.id = a.carrera_id
            LEFT JOIN calificaciones cal ON a.id = cal.asignatura_id
            WHERE c.activa = TRUE AND cal.calificacion_final IS NOT NULL
            GROUP BY c.id, c.nombre
            ORDER BY porcentaje_reprobacion DESC
        `);
        
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener índices de reprobación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/reportes/rendimiento-profesores', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                CONCAT(u.nombre, ' ', u.apellido) as profesor,
                p.numero_empleado,
                COUNT(DISTINCT pag.asignatura_id) as asignaturas_impartidas,
                COUNT(cal.id) as total_calificaciones,
                AVG(cal.calificacion_final) as promedio_calificaciones,
                SUM(CASE WHEN cal.estatus = 'aprobado' THEN 1 ELSE 0 END) as estudiantes_aprobados,
                SUM(CASE WHEN cal.estatus = 'reprobado' THEN 1 ELSE 0 END) as estudiantes_reprobados,
                ROUND((SUM(CASE WHEN cal.estatus = 'aprobado' THEN 1 ELSE 0 END) * 100.0 / COUNT(cal.id)), 2) as porcentaje_aprobacion
            FROM profesores p
            INNER JOIN usuarios u ON p.usuario_id = u.id
            LEFT JOIN profesor_asignatura_grupo pag ON p.id = pag.profesor_id
            LEFT JOIN calificaciones cal ON p.id = cal.profesor_id AND cal.calificacion_final IS NOT NULL
            WHERE p.activo = TRUE AND u.activo = TRUE
            GROUP BY p.id, u.nombre, u.apellido, p.numero_empleado
            HAVING total_calificaciones > 0
            ORDER BY porcentaje_aprobacion DESC
        `);
        
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener rendimiento por profesores:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/reportes/riesgo-academico', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                rr.tipo_riesgo,
                rr.nivel_riesgo,
                COUNT(*) as total_reportes,
                SUM(CASE WHEN rr.estado = 'abierto' THEN 1 ELSE 0 END) as abiertos,
                SUM(CASE WHEN rr.estado = 'en_proceso' THEN 1 ELSE 0 END) as en_proceso,
                SUM(CASE WHEN rr.estado = 'resuelto' THEN 1 ELSE 0 END) as resueltos,
                SUM(CASE WHEN rr.estado = 'cerrado' THEN 1 ELSE 0 END) as cerrados
            FROM reportes_riesgo rr
            WHERE rr.fecha_reporte >= DATE_SUB(NOW(), INTERVAL 1 YEAR)
            GROUP BY rr.tipo_riesgo, rr.nivel_riesgo
            ORDER BY 
                CASE rr.nivel_riesgo 
                    WHEN 'critico' THEN 1
                    WHEN 'alto' THEN 2
                    WHEN 'medio' THEN 3
                    WHEN 'bajo' THEN 4
                END,
                total_reportes DESC
        `);
        
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener reportes de riesgo académico:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/reportes/analisis-desercion', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                c.nombre as carrera,
                a.cuatrimestre_actual,
                COUNT(*) as total_estudiantes,
                SUM(CASE WHEN a.estado_alumno = 'baja_definitiva' THEN 1 ELSE 0 END) as desercion_definitiva,
                SUM(CASE WHEN a.estado_alumno = 'baja_temporal' THEN 1 ELSE 0 END) as desercion_temporal,
                ROUND((SUM(CASE WHEN a.estado_alumno IN ('baja_definitiva', 'baja_temporal') THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2) as porcentaje_desercion
            FROM alumnos a
            INNER JOIN carreras c ON a.carrera_id = c.id
            INNER JOIN usuarios u ON a.usuario_id = u.id
            WHERE u.activo = TRUE OR a.estado_alumno IN ('baja_definitiva', 'baja_temporal')
            GROUP BY c.id, c.nombre, a.cuatrimestre_actual
            ORDER BY c.nombre, a.cuatrimestre_actual
        `);
        
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener análisis de deserción:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/reportes/promedio-carreras', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                c.nombre as carrera,
                c.codigo,
                COUNT(DISTINCT a.id) as total_estudiantes,
                AVG(a.promedio_general) as promedio_carrera,
                MIN(a.promedio_general) as promedio_minimo,
                MAX(a.promedio_general) as promedio_maximo,
                SUM(CASE WHEN a.promedio_general >= 9.0 THEN 1 ELSE 0 END) as excelencia,
                SUM(CASE WHEN a.promedio_general >= 8.0 AND a.promedio_general < 9.0 THEN 1 ELSE 0 END) as muy_bueno,
                SUM(CASE WHEN a.promedio_general >= 7.0 AND a.promedio_general < 8.0 THEN 1 ELSE 0 END) as bueno,
                SUM(CASE WHEN a.promedio_general < 7.0 THEN 1 ELSE 0 END) as regular
            FROM carreras c
            LEFT JOIN alumnos a ON c.id = a.carrera_id
            INNER JOIN usuarios u ON a.usuario_id = u.id
            WHERE c.activa = TRUE AND u.activo = TRUE AND a.promedio_general > 0
            GROUP BY c.id, c.nombre, c.codigo
            ORDER BY promedio_carrera DESC
        `);
        
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener promedio por carreras:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/reportes/solicitudes-ayuda', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                sa.id,
                sa.tipo_problema,
                sa.descripcion_problema,
                sa.urgencia,
                sa.estado,
                sa.fecha_solicitud,
                CONCAT(u.nombre, ' ', u.apellido) as estudiante,
                a.matricula,
                c.nombre as carrera
            FROM solicitudes_ayuda sa
            INNER JOIN alumnos a ON sa.alumno_id = a.id
            INNER JOIN usuarios u ON a.usuario_id = u.id
            INNER JOIN carreras c ON a.carrera_id = c.id
            WHERE sa.fecha_solicitud >= DATE_SUB(NOW(), INTERVAL 1 YEAR)
            ORDER BY 
                CASE sa.urgencia 
                    WHEN 'alta' THEN 1
                    WHEN 'media' THEN 2
                    WHEN 'baja' THEN 3
                END,
                sa.fecha_solicitud DESC
        `);
        
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener solicitudes de ayuda:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/reportes/distribucion-grupos', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                g.codigo as grupo,
                c.nombre as carrera,
                g.cuatrimestre,
                g.ciclo_escolar,
                g.periodo,
                COUNT(ag.alumno_id) as estudiantes_inscritos,
                g.capacidad_maxima,
                ROUND((COUNT(ag.alumno_id) * 100.0 / g.capacidad_maxima), 2) as porcentaje_ocupacion,
                CONCAT(u.nombre, ' ', u.apellido) as profesor_tutor
            FROM grupos g
            INNER JOIN carreras c ON g.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON g.id = ag.grupo_id AND ag.activo = TRUE
            LEFT JOIN profesores p ON g.profesor_tutor_id = p.id
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            WHERE g.activo = TRUE
            GROUP BY g.id, g.codigo, c.nombre, g.cuatrimestre, g.ciclo_escolar, g.periodo, g.capacidad_maxima, u.nombre, u.apellido
            ORDER BY c.nombre, g.cuatrimestre, g.codigo
        `);
        
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener distribución por grupos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.get('/reportes/analisis-vulnerabilidad', verifyToken, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                e.titulo as encuesta,
                e.tipo_encuesta,
                COUNT(DISTINCT re.alumno_id) as estudiantes_respondieron,
                COUNT(DISTINCT pe.id) as total_preguntas,
                COUNT(re.id) as total_respuestas,
                c.nombre as carrera,
                AVG(
                    CASE 
                        WHEN pe.tipo_respuesta = 'escala' AND re.respuesta REGEXP '^[0-9]+$' 
                        THEN CAST(re.respuesta AS DECIMAL(3,2))
                        ELSE NULL 
                    END
                ) as promedio_escala
            FROM encuestas e
            LEFT JOIN preguntas_encuesta pe ON e.id = pe.encuesta_id
            LEFT JOIN respuestas_encuesta re ON pe.id = re.pregunta_id
            LEFT JOIN alumnos a ON re.alumno_id = a.id
            LEFT JOIN carreras c ON a.carrera_id = c.id
            WHERE e.activa = TRUE
            GROUP BY e.id, e.titulo, e.tipo_encuesta, c.nombre
            ORDER BY estudiantes_respondieron DESC
        `);
        
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener análisis de vulnerabilidad:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

export default router;