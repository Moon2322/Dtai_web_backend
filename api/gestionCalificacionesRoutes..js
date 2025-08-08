// api/gestionCalificacionesRoutes.js
import express from 'express';
import { db } from '../index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Middleware para verificar que el usuario sea profesor
const verifyProfesor = async (req, res, next) => {
    try {
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
    } catch (error) {
        console.error('Error en verifyProfesor:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

// Usar middleware en todas las rutas
router.use(verifyToken);
router.use(verifyProfesor);

// ============================================
// FUNCIONES AUXILIARES
// ============================================

// Función para determinar siguiente oportunidad
function obtenerSiguienteOportunidad(oportunidadActual, ultimaOportunidadUsada) {
    switch (oportunidadActual) {
        case 'ordinario':
            return 'remedial';
        case 'remedial':
            return 'extraordinario';
        case 'extraordinario':
            return ultimaOportunidadUsada ? null : 'ultima_oportunidad';
        case 'ultima_oportunidad':
            return null; // Ya no hay más oportunidades
        default:
            return 'ordinario';
    }
}

// Función para calcular calificación final
function calcularCalificacionFinal(evaluacionesFinales) {
    if (evaluacionesFinales.length === 0) {
        return { calificacion_final: null, estatus: 'cursando' };
    }
    
    // Si hay algún "NA" en las evaluaciones finales → Reprobado
    const tieneNA = evaluacionesFinales.some(e => e.calificacion === 'NA');
    if (tieneNA) {
        return { calificacion_final: 'NA', estatus: 'reprobado' };
    }
    
    // Calcular promedio de las calificaciones numéricas
    const calificacionesNumericas = evaluacionesFinales
        .filter(e => e.calificacion !== 'NA')
        .map(e => parseFloat(e.calificacion));
    
    if (calificacionesNumericas.length === 0) {
        return { calificacion_final: null, estatus: 'cursando' };
    }
    
    const promedio = calificacionesNumericas.reduce((a, b) => a + b, 0) / calificacionesNumericas.length;
    
    // Solo 8+ es aprobado
    const promedioFinal = promedio.toFixed(1);
    const estatus = parseFloat(promedioFinal) >= 8 ? 'aprobado' : 'reprobado';
    
    return { 
        calificacion_final: promedioFinal, 
        estatus: estatus 
    };
}

// Función para recalcular calificación final
async function recalcularCalificacionFinal(calificacionId, connection = null) {
    try {
        const dbConnection = connection || db;
        
        const [evaluacionesFinales] = await dbConnection.execute(`
            SELECT numero_parcial, calificacion, aprobado
            FROM evaluaciones_detalle
            WHERE calificacion_id = ? AND es_calificacion_final = TRUE
            ORDER BY numero_parcial
        `, [calificacionId]);
        
        const resultado = calcularCalificacionFinal(evaluacionesFinales);
        
        await dbConnection.execute(`
            UPDATE calificaciones 
            SET calificacion_final = ?, estatus = ?, fecha_actualizacion = NOW()
            WHERE id = ?
        `, [resultado.calificacion_final, resultado.estatus, calificacionId]);
        
        console.log(`✅ Calificación final recalculada: ${resultado.calificacion_final} (${resultado.estatus})`);
        
        return resultado;
        
    } catch (error) {
        console.error('Error al recalcular calificación final:', error);
        throw error;
    }
}

// ============================================
// RUTAS DE LA API
// ============================================

// Obtener todas las calificaciones del profesor
router.get('/calificaciones', async (req, res) => {
    try {
        const [calificaciones] = await db.execute(`
            SELECT 
                c.id,
                c.calificacion_final,
                c.estatus,
                c.observaciones,
                c.ciclo_escolar,
                c.fecha_captura,
                c.fecha_actualizacion,
                CONCAT(u.nombre, ' ', u.apellido) as estudiante_nombre,
                a.matricula as estudiante_matricula,
                asig.nombre as asignatura_nombre,
                asig.codigo as asignatura_codigo,
                g.codigo as grupo_codigo,
                g.cuatrimestre,
                car.nombre as carrera_nombre,
                -- Obtener detalle de evaluaciones como JSON
                (SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'numero_parcial', ed.numero_parcial,
                        'oportunidad', ed.oportunidad,
                        'calificacion', ed.calificacion,
                        'fecha_evaluacion', ed.fecha_evaluacion,
                        'aprobado', ed.aprobado
                    )
                 )
                 FROM evaluaciones_detalle ed 
                 WHERE ed.calificacion_id = c.id 
                 AND ed.es_calificacion_final = TRUE
                 ORDER BY ed.numero_parcial ASC) as detalle_parciales
            FROM calificaciones c
            JOIN alumnos a ON c.alumno_id = a.id
            JOIN usuarios u ON a.usuario_id = u.id
            JOIN asignaturas asig ON c.asignatura_id = asig.id
            JOIN grupos g ON c.grupo_id = g.id
            JOIN carreras car ON g.carrera_id = car.id
            WHERE c.profesor_id = ?
            ORDER BY c.fecha_actualizacion DESC
        `, [req.profesor_id]);

        res.json({
            success: true,
            data: calificaciones
        });

    } catch (error) {
        console.error('Error al obtener calificaciones:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener estadísticas de calificaciones del profesor
router.get('/estadisticas', async (req, res) => {
    try {
        const [estadisticas] = await db.execute(`
            SELECT 
                COUNT(*) as total_calificaciones,
                COUNT(CASE WHEN calificacion_final != 'NA' AND calificacion_final IS NOT NULL 
                      AND CAST(calificacion_final AS DECIMAL(3,1)) >= 8 THEN 1 END) as aprobados,
                COUNT(CASE WHEN calificacion_final = 'NA' OR 
                      (calificacion_final IS NOT NULL AND CAST(calificacion_final AS DECIMAL(3,1)) < 8) THEN 1 END) as reprobados,
                COUNT(CASE WHEN estatus = 'cursando' THEN 1 END) as cursando,
                AVG(CASE WHEN calificacion_final != 'NA' AND calificacion_final IS NOT NULL 
                    THEN CAST(calificacion_final AS DECIMAL(3,1)) END) as promedio_general
            FROM calificaciones
            WHERE profesor_id = ?
        `, [req.profesor_id]);

        res.json({
            success: true,
            data: {
                ...estadisticas[0],
                promedio_general: parseFloat(estadisticas[0].promedio_general || 0).toFixed(2)
            }
        });

    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Obtener estado de todos los parciales de un estudiante específico
router.get('/estudiante/:alumnoId/estado-parciales/:asignaturaId/:grupoId', async (req, res) => {
    try {
        const { alumnoId, asignaturaId, grupoId } = req.params;

        // Verificar que el profesor tenga acceso
        const [acceso] = await db.execute(`
            SELECT id FROM profesor_asignatura_grupo 
            WHERE profesor_id = ? AND asignatura_id = ? AND grupo_id = ? AND activo = 1
        `, [req.profesor_id, asignaturaId, grupoId]);

        if (acceso.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta asignatura/grupo'
            });
        }

        // Obtener información del alumno y su última oportunidad
        const [alumnoInfo] = await db.execute(`
            SELECT id, ultima_oportunidad_usada FROM alumnos WHERE id = ?
        `, [alumnoId]);

        if (alumnoInfo.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Estudiante no encontrado'
            });
        }

        const ultimaOportunidadUsada = alumnoInfo[0].ultima_oportunidad_usada;

        // ✅ CONSULTAR TODAS las evaluaciones (tanto finales como no finales) para obtener el estado completo
        const [evaluaciones] = await db.execute(`
            SELECT 
                ed.numero_parcial,
                ed.oportunidad,
                ed.calificacion,
                ed.aprobado,
                ed.fecha_evaluacion,
                ed.es_calificacion_final
            FROM evaluaciones_detalle ed
            JOIN calificaciones c ON ed.calificacion_id = c.id
            WHERE c.alumno_id = ? 
            AND c.asignatura_id = ? 
            AND c.grupo_id = ? 
            AND c.profesor_id = ?
            ORDER BY ed.numero_parcial ASC, ed.fecha_evaluacion DESC
        `, [alumnoId, asignaturaId, grupoId, req.profesor_id]);

        console.log(`📊 Evaluaciones finales del estudiante ${alumnoId}:`, evaluaciones);

        let estadoParciales = {
            1: { estado: 'disponible', siguiente_oportunidad: 'ordinario' },
            2: { estado: 'bloqueado', siguiente_oportunidad: null },
            3: { estado: 'bloqueado', siguiente_oportunidad: null }
        };

        // Buscar el calificacion_id si existe
        const [calificacionExiste] = await db.execute(`
            SELECT id FROM calificaciones 
            WHERE alumno_id = ? AND asignatura_id = ? AND grupo_id = ? AND profesor_id = ?
        `, [alumnoId, asignaturaId, grupoId, req.profesor_id]);

        const calificacionId = calificacionExiste.length > 0 ? calificacionExiste[0].id : null;

        // Analizar cada parcial (1, 2, 3)
        for (let parcial = 1; parcial <= 3; parcial++) {
            // ✅ OBTENER la evaluación más reciente (final o no final) de este parcial
            const evaluacionesParcial = evaluaciones.filter(e => e.numero_parcial === parcial);
            
            // Si hay múltiples evaluaciones del mismo parcial, tomar la más reciente que sea final
            // Si no hay ninguna final, tomar la más reciente
            let evaluacionParcial = null;
            if (evaluacionesParcial.length > 0) {
                // Buscar primero una evaluación final
                evaluacionParcial = evaluacionesParcial.find(e => e.es_calificacion_final) || evaluacionesParcial[0];
            }
            
            if (!evaluacionParcial) {
                // ✅ No tiene evaluación de este parcial
                if (parcial === 1) {
                    // Parcial 1 siempre está disponible si no tiene evaluación
                    estadoParciales[parcial] = {
                        estado: 'disponible',
                        siguiente_oportunidad: 'ordinario',
                        motivo: 'Primera evaluación del parcial'
                    };
                } else {
                    // Parciales 2 y 3: verificar si el anterior está aprobado
                    const parcialAnterior = estadoParciales[parcial - 1];
                    if (parcialAnterior.estado === 'aprobado') {
                        estadoParciales[parcial] = {
                            estado: 'disponible',
                            siguiente_oportunidad: 'ordinario',
                            motivo: 'Primera evaluación del parcial'
                        };
                    } else {
                        estadoParciales[parcial] = {
                            estado: 'bloqueado',
                            siguiente_oportunidad: null,
                            motivo: `Debe aprobar Parcial ${parcial - 1} primero`
                        };
                    }
                }
            } else {
                // ✅ Tiene evaluación de este parcial
                if (evaluacionParcial.aprobado) {
                    // Ya aprobó este parcial
                    estadoParciales[parcial] = {
                        estado: 'aprobado',
                        siguiente_oportunidad: null,
                        calificacion_actual: evaluacionParcial.calificacion,
                        oportunidad_aprobada: evaluacionParcial.oportunidad,
                        motivo: `Aprobado con ${evaluacionParcial.calificacion} en ${evaluacionParcial.oportunidad}`
                    };
                } else {
                    // Reprobó, determinar siguiente oportunidad
                    const siguienteOportunidad = obtenerSiguienteOportunidad(
                        evaluacionParcial.oportunidad, 
                        ultimaOportunidadUsada
                    );
                    
                    if (siguienteOportunidad) {
                        estadoParciales[parcial] = {
                            estado: 'disponible',
                            siguiente_oportunidad: siguienteOportunidad,
                            calificacion_anterior: evaluacionParcial.calificacion,
                            oportunidad_anterior: evaluacionParcial.oportunidad,
                            motivo: `Reprobó en ${evaluacionParcial.oportunidad} (${evaluacionParcial.calificacion}), puede tomar ${siguienteOportunidad}`
                        };
                    } else {
                        estadoParciales[parcial] = {
                            estado: 'reprobado_final',
                            siguiente_oportunidad: null,
                            calificacion_final: evaluacionParcial.calificacion,
                            motivo: `Reprobado final - agotó todas las oportunidades`
                        };
                    }
                }
            }
        }

        res.json({
            success: true,
            data: {
                calificacion_id: calificacionId,
                parciales: estadoParciales,
                ultima_oportunidad_usada: ultimaOportunidadUsada,
                evaluaciones_historial: evaluaciones
            }
        });

    } catch (error) {
        console.error('Error al obtener estado de parciales:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Inicializar calificación para un estudiante
router.post('/inicializar', async (req, res) => {
    try {
        const { alumno_id, asignatura_id, grupo_id } = req.body;

        if (!alumno_id || !asignatura_id || !grupo_id) {
            return res.status(400).json({
                success: false,
                message: 'Faltan datos obligatorios (alumno_id, asignatura_id, grupo_id)'
            });
        }

        // Verificar acceso del profesor
        const [acceso] = await db.execute(`
            SELECT id, ciclo_escolar FROM profesor_asignatura_grupo 
            WHERE profesor_id = ? AND asignatura_id = ? AND grupo_id = ? AND activo = 1
        `, [req.profesor_id, asignatura_id, grupo_id]);

        if (acceso.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta asignatura y grupo'
            });
        }

        const cicloEscolar = acceso[0].ciclo_escolar;

        // Verificar si ya existe
        const [existe] = await db.execute(`
            SELECT id FROM calificaciones 
            WHERE alumno_id = ? AND asignatura_id = ? AND grupo_id = ? AND profesor_id = ? AND ciclo_escolar = ?
        `, [alumno_id, asignatura_id, grupo_id, req.profesor_id, cicloEscolar]);

        if (existe.length > 0) {
            return res.json({
                success: true,
                message: 'Calificación ya existe',
                calificacion_id: existe[0].id
            });
        }

        // Crear nueva calificación
        const [resultado] = await db.execute(`
            INSERT INTO calificaciones (
                alumno_id, asignatura_id, grupo_id, profesor_id, ciclo_escolar, 
                estatus, fecha_captura, fecha_actualizacion
            ) VALUES (?, ?, ?, ?, ?, 'cursando', NOW(), NOW())
        `, [alumno_id, asignatura_id, grupo_id, req.profesor_id, cicloEscolar]);

        res.json({
            success: true,
            message: 'Calificación inicializada exitosamente',
            calificacion_id: resultado.insertId
        });

    } catch (error) {
        console.error('Error al inicializar calificación:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

// Evaluar un parcial específico
router.post('/:calificacionId/evaluar-parcial', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();
        
        const calificacionId = req.params.calificacionId;
        const { numero_parcial, oportunidad, calificacion, observaciones_parcial } = req.body;

        // Validaciones básicas
        if (!numero_parcial || !oportunidad || !calificacion) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Datos incompletos: parcial, oportunidad y calificación son requeridos'
            });
        }

        // Verificar que la calificación pertenece al profesor
        const [calificacionExiste] = await connection.execute(`
            SELECT c.*, al.ultima_oportunidad_usada
            FROM calificaciones c
            JOIN alumnos al ON c.alumno_id = al.id
            WHERE c.id = ? AND c.profesor_id = ?
        `, [calificacionId, req.profesor_id]);

        if (calificacionExiste.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: 'Calificación no encontrada o sin permisos'
            });
        }

        // Verificar si puede usar última oportunidad
        if (oportunidad === 'ultima_oportunidad' && calificacionExiste[0].ultima_oportunidad_usada) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'El alumno ya usó su única oportunidad especial'
            });
        }

        // Verificar que no existe ya una evaluación para esta oportunidad
        const [evaluacionExiste] = await connection.execute(`
            SELECT id FROM evaluaciones_detalle
            WHERE calificacion_id = ? AND numero_parcial = ? AND oportunidad = ?
        `, [calificacionId, numero_parcial, oportunidad]);

        if (evaluacionExiste.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Ya existe una evaluación para esta oportunidad'
            });
        }

        // ✅ CORREGIR: Determinar valores automáticos con lógica 8+
        const aprobado = calificacion !== 'NA' && parseFloat(calificacion) >= 8;
        
        // ✅ CORREGIR: Una evaluación es "final" si:
        // - Aprobó (8+) → Final porque ya no necesita más oportunidades
        // - Es última_oportunidad → Final porque no hay más oportunidades
        // - Las demás (NA en ordinario/remedial/extraordinario) → NO son finales
        const esCalificacionFinal = aprobado || oportunidad === 'ultima_oportunidad';

        console.log(`📊 Evaluando: ${calificacion}, Aprobado: ${aprobado}, Es Final: ${esCalificacionFinal}`);

        // Si es calificación final, desactivar evaluaciones anteriores de este parcial
        if (esCalificacionFinal) {
            await connection.execute(`
                UPDATE evaluaciones_detalle 
                SET es_calificacion_final = FALSE
                WHERE calificacion_id = ? AND numero_parcial = ?
            `, [calificacionId, numero_parcial]);
        }

        // Marcar como usada la última oportunidad si aplica
        if (oportunidad === 'ultima_oportunidad') {
            await connection.execute(`
                UPDATE alumnos SET ultima_oportunidad_usada = TRUE 
                WHERE id = (SELECT alumno_id FROM calificaciones WHERE id = ?)
            `, [calificacionId]);
        }

        // Insertar nueva evaluación
        const [resultado] = await connection.execute(`
            INSERT INTO evaluaciones_detalle (
                calificacion_id, numero_parcial, oportunidad, calificacion,
                fecha_evaluacion, aprobado, es_calificacion_final, observaciones_parcial
            ) VALUES (?, ?, ?, ?, NOW(), ?, ?, ?)
        `, [
            calificacionId, numero_parcial, oportunidad, calificacion, 
            aprobado, esCalificacionFinal, observaciones_parcial || null
        ]);

        console.log(`✅ Evaluación guardada: Parcial ${numero_parcial}, ${oportunidad}, ${calificacion} (Aprobado: ${aprobado})`);

        // Recalcular calificación final
        const resultadoCalculo = await recalcularCalificacionFinal(calificacionId, connection);

        await connection.commit();

        res.json({
            success: true,
            message: `Evaluación guardada correctamente. ${aprobado ? 'Aprobado' : 'No aprobado'} en ${oportunidad}`,
            data: {
                evaluacion_id: resultado.insertId,
                calificacion_final: resultadoCalculo.calificacion_final,
                estatus: resultadoCalculo.estatus,
                es_calificacion_final: esCalificacionFinal
            }
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al evaluar parcial:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor: ' + error.message
        });
    } finally {
        connection.release();
    }
});

export default router;