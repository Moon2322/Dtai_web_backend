// ============================================
// ARCHIVO: api/profesorValidacionesRoutes.js
// Rutas específicas para validaciones del profesor
// ============================================

import express from 'express';
import { db } from '../index.js';
import { validarProfesor } from '../middleware/auth.js';

const router = express.Router();

// Aplicar middleware de validación de profesor a todas las rutas
router.use(validarProfesor);

// ============================================
// VERIFICAR SI EL PROFESOR ES TUTOR
// ============================================

router.get('/verificar-tutor', async (req, res) => {
    try {
        console.log('🔍 Verificando si profesor es tutor. ID:', req.profesor_id);

        // Buscar grupos donde el profesor es tutor
        const [gruposTutorados] = await db.execute(`
            SELECT 
                g.id,
                g.codigo,
                g.cuatrimestre,
                g.ciclo_escolar,
                g.periodo,
                g.año,
                c.nombre as carrera_nombre,
                c.codigo as carrera_codigo,
                COUNT(ag.alumno_id) as total_estudiantes,
                g.capacidad_maxima,
                g.aula
            FROM grupos g
            JOIN carreras c ON g.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON g.id = ag.grupo_id AND ag.activo = 1
            WHERE g.profesor_tutor_id = ? 
            AND g.activo = 1
            GROUP BY g.id, g.codigo, g.cuatrimestre, g.ciclo_escolar, 
                     g.periodo, g.año, c.nombre, c.codigo, g.capacidad_maxima, g.aula
            ORDER BY g.cuatrimestre ASC, g.codigo ASC
        `, [req.profesor_id]);

        const esTutor = gruposTutorados.length > 0;

        console.log(`✅ Resultado: Profesor ${esTutor ? 'SÍ' : 'NO'} es tutor`);
        
        if (esTutor) {
            console.log('📚 Grupos tutorados encontrados:');
            gruposTutorados.forEach(grupo => {
                console.log(`   - ${grupo.codigo} (${grupo.carrera_nombre}) - ${grupo.total_estudiantes}/${grupo.capacidad_maxima} estudiantes`);
            });
        }

        res.json({
            success: true,
            esTutor: esTutor,
            totalGruposTutorados: gruposTutorados.length,
            gruposTutorados: gruposTutorados,
            message: esTutor 
                ? `Profesor es tutor de ${gruposTutorados.length} grupo(s)`
                : 'Profesor no es tutor de ningún grupo'
        });

    } catch (error) {
        console.error('❌ Error al verificar si es tutor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            esTutor: false
        });
    }
});

// ============================================
// VERIFICAR PERMISOS ESPECÍFICOS
// ============================================

// Verificar si el profesor puede acceder a un grupo específico
router.get('/verificar-acceso-grupo/:grupoId', async (req, res) => {
    try {
        const { grupoId } = req.params;
        console.log(`🔍 Verificando acceso del profesor ${req.profesor_id} al grupo ${grupoId}`);

        // Verificar si es tutor del grupo
        const [grupoTutor] = await db.execute(`
            SELECT 
                g.id,
                g.codigo,
                g.cuatrimestre,
                c.nombre as carrera_nombre,
                'tutor' as tipo_acceso
            FROM grupos g
            JOIN carreras c ON g.carrera_id = c.id
            WHERE g.id = ? 
            AND g.profesor_tutor_id = ? 
            AND g.activo = 1
        `, [grupoId, req.profesor_id]);

        // Verificar si imparte materias en el grupo
        const [grupoMaterias] = await db.execute(`
            SELECT DISTINCT
                g.id,
                g.codigo,
                g.cuatrimestre,
                c.nombre as carrera_nombre,
                'docente' as tipo_acceso,
                COUNT(DISTINCT pag.asignatura_id) as materias_impartidas
            FROM grupos g
            JOIN carreras c ON g.carrera_id = c.id
            JOIN profesor_asignatura_grupo pag ON g.id = pag.grupo_id
            WHERE g.id = ? 
            AND pag.profesor_id = ? 
            AND g.activo = 1 
            AND pag.activo = 1
            GROUP BY g.id, g.codigo, g.cuatrimestre, c.nombre
        `, [grupoId, req.profesor_id]);

        const tieneAcceso = grupoTutor.length > 0 || grupoMaterias.length > 0;
        const tipoAcceso = [];

        if (grupoTutor.length > 0) {
            tipoAcceso.push('tutor');
        }
        if (grupoMaterias.length > 0) {
            tipoAcceso.push('docente');
        }

        console.log(`✅ Acceso al grupo ${grupoId}: ${tieneAcceso ? 'PERMITIDO' : 'DENEGADO'}`);
        if (tieneAcceso) {
            console.log(`📝 Tipo de acceso: ${tipoAcceso.join(', ')}`);
        }

        res.json({
            success: true,
            tieneAcceso: tieneAcceso,
            tipoAcceso: tipoAcceso,
            detalles: {
                esTutor: grupoTutor.length > 0,
                esDocente: grupoMaterias.length > 0,
                materiasImpartidas: grupoMaterias[0]?.materias_impartidas || 0
            },
            grupoInfo: grupoTutor[0] || grupoMaterias[0] || null
        });

    } catch (error) {
        console.error('❌ Error al verificar acceso al grupo:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            tieneAcceso: false
        });
    }
});

// ============================================
// VERIFICAR SI PUEDE GESTIONAR CALIFICACIONES
// ============================================

router.get('/verificar-puede-calificar/:asignaturaId/:grupoId', async (req, res) => {
    try {
        const { asignaturaId, grupoId } = req.params;
        console.log(`🔍 Verificando si profesor ${req.profesor_id} puede calificar asignatura ${asignaturaId} en grupo ${grupoId}`);

        // Verificar asignación activa
        const [asignacion] = await db.execute(`
            SELECT 
                pag.id,
                pag.ciclo_escolar,
                asig.nombre as asignatura_nombre,
                asig.codigo as asignatura_codigo,
                g.codigo as grupo_codigo,
                g.cuatrimestre,
                c.nombre as carrera_nombre
            FROM profesor_asignatura_grupo pag
            JOIN asignaturas asig ON pag.asignatura_id = asig.id
            JOIN grupos g ON pag.grupo_id = g.id
            JOIN carreras c ON g.carrera_id = c.id
            WHERE pag.profesor_id = ? 
            AND pag.asignatura_id = ? 
            AND pag.grupo_id = ? 
            AND pag.activo = 1
        `, [req.profesor_id, asignaturaId, grupoId]);

        const puedeCalificar = asignacion.length > 0;

        console.log(`✅ Puede calificar: ${puedeCalificar ? 'SÍ' : 'NO'}`);
        if (puedeCalificar) {
            const info = asignacion[0];
            console.log(`📚 ${info.asignatura_nombre} - ${info.grupo_codigo} (${info.carrera_nombre})`);
        }

        res.json({
            success: true,
            puedeCalificar: puedeCalificar,
            asignacionInfo: asignacion[0] || null,
            message: puedeCalificar 
                ? 'Profesor autorizado para calificar esta asignatura'
                : 'Profesor no tiene permisos para calificar esta asignatura'
        });

    } catch (error) {
        console.error('❌ Error al verificar permisos de calificación:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor',
            puedeCalificar: false
        });
    }
});

// ============================================
// OBTENER RESUMEN DE PERMISOS DEL PROFESOR
// ============================================

router.get('/resumen-permisos', async (req, res) => {
    try {
        console.log(`🔍 Obteniendo resumen de permisos para profesor ${req.profesor_id}`);

        // Grupos como tutor
        const [gruposTutor] = await db.execute(`
            SELECT 
                g.id,
                g.codigo,
                g.cuatrimestre,
                c.nombre as carrera_nombre,
                COUNT(ag.alumno_id) as total_estudiantes
            FROM grupos g
            JOIN carreras c ON g.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON g.id = ag.grupo_id AND ag.activo = 1
            WHERE g.profesor_tutor_id = ? AND g.activo = 1
            GROUP BY g.id, g.codigo, g.cuatrimestre, c.nombre
        `, [req.profesor_id]);

        // Asignaturas que imparte
        const [asignaturasDocente] = await db.execute(`
            SELECT 
                asig.id as asignatura_id,
                asig.nombre as asignatura_nombre,
                asig.codigo as asignatura_codigo,
                g.id as grupo_id,
                g.codigo as grupo_codigo,
                g.cuatrimestre,
                c.nombre as carrera_nombre,
                pag.ciclo_escolar
            FROM profesor_asignatura_grupo pag
            JOIN asignaturas asig ON pag.asignatura_id = asig.id
            JOIN grupos g ON pag.grupo_id = g.id
            JOIN carreras c ON g.carrera_id = c.id
            WHERE pag.profesor_id = ? AND pag.activo = 1
            ORDER BY g.cuatrimestre, asig.nombre
        `, [req.profesor_id]);

        const permisos = {
            esTutor: gruposTutor.length > 0,
            esDocente: asignaturasDocente.length > 0,
            totalGruposTutorados: gruposTutor.length,
            totalAsignaturas: asignaturasDocente.length,
            gruposTutorados: gruposTutor,
            asignaturasImpartidas: asignaturasDocente
        };

        console.log(`✅ Resumen generado: Tutor de ${permisos.totalGruposTutorados} grupos, Docente en ${permisos.totalAsignaturas} asignaturas`);

        res.json({
            success: true,
            permisos: permisos,
            message: `Profesor con acceso a ${permisos.totalGruposTutorados + permisos.totalAsignaturas} asignaciones`
        });

    } catch (error) {
        console.error('❌ Error al obtener resumen de permisos:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

export default router;