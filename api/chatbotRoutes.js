import express from 'express';
import { db } from '../index.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/chatbot/nueva-conversacion', verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        if (!userId) {
            return res.status(400).json({ error: 'Usuario no identificado' });
        }
        
        const [directivo] = await db.execute(
            'SELECT id FROM directivos WHERE usuario_id = ?',
            [userId]
        );
        
        if (directivo.length === 0) {
            return res.status(403).json({ error: 'Usuario no es directivo' });
        }
        
        const directivoId = directivo[0].id;
        const [result] = await db.execute(
            `INSERT INTO conversaciones_chatbot (directivo_id, titulo) VALUES (?, ?)`,
            [directivoId, 'Nueva conversación']
        );
        
        res.json({ 
            success: true, 
            conversacionId: result.insertId 
        });
    } catch (error) {
        console.error('Error al crear conversación:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.get('/chatbot/conversaciones', verifyToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        if (!userId) {
            return res.status(400).json({ error: 'Usuario no identificado' });
        }
        
        const [directivo] = await db.execute(
            'SELECT id FROM directivos WHERE usuario_id = ?',
            [userId]
        );
        
        if (directivo.length === 0) {
            return res.status(403).json({ error: 'Usuario no es directivo' });
        }
        
        const directivoId = directivo[0].id;
        const [rows] = await db.execute(
            `SELECT id, titulo, fecha_creacion, fecha_actualizacion 
             FROM conversaciones_chatbot 
             WHERE directivo_id = ? 
             ORDER BY fecha_actualizacion DESC 
             LIMIT 10`,
            [directivoId]
        );
        
        res.json(rows);
    } catch (error) {
        console.error('Error al obtener conversaciones:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

router.get('/chatbot/conversacion/:id', verifyToken, async (req, res) => {
    try {
        const conversacionId = req.params.id;
        const userId = req.user.userId;
        
        if (!userId) {
            return res.status(400).json({ error: 'Usuario no identificado' });
        }
        
        const [directivo] = await db.execute(
            'SELECT id FROM directivos WHERE usuario_id = ?',
            [userId]
        );
        
        if (directivo.length === 0) {
            return res.status(403).json({ error: 'Usuario no es directivo' });
        }
        
        const directivoId = directivo[0].id;
        const [conversacion] = await db.execute(
            `SELECT id FROM conversaciones_chatbot WHERE id = ? AND directivo_id = ?`,
            [conversacionId, directivoId]
        );
        
        if (conversacion.length === 0) {
            return res.status(404).json({ error: 'Conversación no encontrada' });
        }
        
        const [mensajes] = await db.execute(
            `SELECT id, tipo_mensaje, contenido, timestamp 
             FROM mensajes_chatbot 
             WHERE conversacion_id = ? 
             ORDER BY timestamp ASC`,
            [conversacionId]
        );
        
        res.json({ mensajes });
    } catch (error) {
        console.error('Error al obtener mensajes:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
router.post('/chatbot/mensaje', verifyToken, async (req, res) => {
    try {
        const { conversacionId, mensaje } = req.body;
        const userId = req.user.userId;
        
        if (!userId || !conversacionId || !mensaje) {
            return res.status(400).json({ error: 'Datos requeridos faltantes' });
        }
        
        const [directivo] = await db.execute(
            'SELECT id FROM directivos WHERE usuario_id = ?',
            [userId]
        );
        
        if (directivo.length === 0) {
            return res.status(403).json({ error: 'Usuario no es directivo' });
        }
        
        const directivoId = directivo[0].id;
        const [conversacion] = await db.execute(
            `SELECT id FROM conversaciones_chatbot WHERE id = ? AND directivo_id = ?`,
            [conversacionId, directivoId]
        );
        
        if (conversacion.length === 0) {
            return res.status(404).json({ error: 'Conversación no encontrada' });
        }
        
        await db.execute(
            `INSERT INTO mensajes_chatbot (conversacion_id, tipo_mensaje, contenido) VALUES (?, 'pregunta', ?)`,
            [conversacionId, mensaje]
        );
        const respuesta = await generateConversationalResponse(mensaje);
        console.log('Respuesta generada:', respuesta);
        
        await db.execute(
            `INSERT INTO mensajes_chatbot (conversacion_id, tipo_mensaje, contenido) VALUES (?, 'respuesta', ?)`,
            [conversacionId, respuesta]
        );
        const [mensajesCount] = await db.execute(
            `SELECT COUNT(*) as count FROM mensajes_chatbot WHERE conversacion_id = ?`,
            [conversacionId]
        );
        
        if (mensajesCount[0].count <= 2) {
            const titulo = mensaje.length > 30 ? mensaje.substring(0, 30) + '...' : mensaje;
            await db.execute(
                `UPDATE conversaciones_chatbot SET titulo = ? WHERE id = ?`,
                [titulo, conversacionId]
            );
        }
        
        await db.execute(
            `UPDATE conversaciones_chatbot SET fecha_actualizacion = NOW() WHERE id = ?`,
            [conversacionId]
        );
        
        res.json({ 
            success: true, 
            respuesta 
        });
        
    } catch (error) {
        console.error('Error al procesar mensaje:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});
async function generateConversationalResponse(mensaje) {
    const mensajeLower = mensaje.toLowerCase().trim();
    
    try {
        console.log('🤖 Analizando mensaje:', mensaje);
        
        const analysis = analyzeMessage(mensajeLower);
        console.log('📊 Análisis:', analysis);
        if (analysis.subject === 'profesor' || analysis.subject === 'docente') {
            return await handleTeacherQuery(analysis, mensaje);
        }
        
        if (analysis.subject === 'estudiante' || analysis.subject === 'alumno') {
            return await handleStudentQuery(analysis, mensaje);
        }
        
        if (analysis.subject === 'grupo' || analysis.subject === 'salon') {
            return await handleGroupQuery(analysis, mensaje);
        }
        
        if (analysis.subject === 'carrera' || analysis.subject === 'programa') {
            return await handleCareerQuery(analysis, mensaje);
        }
        
        if (analysis.subject === 'directivo') {
            return await handleDirectiveQuery(analysis, mensaje);
        }
        
        if (analysis.intent === 'greeting') {
            return handleGreeting();
        }
        
        if (analysis.intent === 'help' || analysis.intent === 'capabilities') {
            return handleHelp();
        }
        
        if (analysis.intent === 'comparison') {
            return await handleComparison(analysis, mensaje);
        }
        
        if (analysis.intent === 'statistics') {
            return await handleStatistics(analysis, mensaje);
        }
        return await handleIntelligentSearch(mensaje, analysis);
        
    } catch (error) {
        console.error('❌ Error en generateConversationalResponse:', error);
        return `Ups, tuve un pequeño problema procesando tu pregunta sobre "${mensaje}". 😅

¿Podrías reformularla? Por ejemplo:
• "¿Cuál es el mejor profesor de matemáticas?"
• "¿Qué estudiante tiene mejor promedio?"
• "¿Cuál grupo tiene mejor rendimiento?"

Estoy aquí para ayudarte con cualquier información específica que necesites. 🤖`;
    }
}

function analyzeMessage(mensaje) {
    const analysis = {
        subject: null,     
        action: null,      
        qualifier: null,  
        scope: null, 
        intent: null 
    };
    if (/\b(profesor|profesores|docente|docentes|maestro|maestros|tutor|tutores)\b/.test(mensaje)) {
        analysis.subject = 'profesor';
    } else if (/\b(estudiante|estudiantes|alumno|alumnos|matricula|matrícula)\b/.test(mensaje)) {
        analysis.subject = 'estudiante';
    } else if (/\b(grupo|grupos|salon|salón|clase|clases)\b/.test(mensaje)) {
        analysis.subject = 'grupo';
    } else if (/\b(carrera|carreras|programa|programas|licenciatura)\b/.test(mensaje)) {
        analysis.subject = 'carrera';
    } else if (/\b(directivo|directivos|director|coordinador)\b/.test(mensaje)) {
        analysis.subject = 'directivo';
    }
    if (/\b(mejor|mejores|bueno|buenos|excelente|sobresaliente|destacado|top|primero)\b/.test(mensaje)) {
        analysis.qualifier = 'best';
    } else if (/\b(peor|peores|malo|malos|bajo|reprobado|reprobados|último)\b/.test(mensaje)) {
        analysis.qualifier = 'worst';
    } else if (/\b(más|mayor|máximo|superior)\b/.test(mensaje)) {
        analysis.qualifier = 'most';
    } else if (/\b(menos|menor|mínimo|inferior)\b/.test(mensaje)) {
        analysis.qualifier = 'least';
    }
    if (/\b(comparar|versus|vs|diferencia|entre)\b/.test(mensaje)) {
        analysis.action = 'compare';
    } else if (/\b(listar|mostrar|dame|ver|todos)\b/.test(mensaje)) {
        analysis.action = 'list';
    } else if (/\b(buscar|encontrar|quién|quien|cuál|cual)\b/.test(mensaje)) {
        analysis.action = 'find';
    }
    if (/\b(tsu|técnico superior)\b/.test(mensaje)) {
        analysis.scope = 'tsu';
    } else if (/\b(ingeniería|ingenieria|ing)\b/.test(mensaje)) {
        analysis.scope = 'ingenieria';
    }
    
    const cuatrimestreMatch = mensaje.match(/\b(cuatri|cuatrimestre)\s*(\d+)\b/);
    if (cuatrimestreMatch) {
        analysis.scope = `cuatrimestre_${cuatrimestreMatch[2]}`;
    }
    
    const grupoMatch = mensaje.match(/\bgrupo\s*([a-zA-Z0-9]+)\b/);
    if (grupoMatch) {
        analysis.scope = `grupo_${grupoMatch[1].toUpperCase()}`;
    }
    if (/\b(hola|hello|hey|buenas|saludos)\b/.test(mensaje)) {
        analysis.intent = 'greeting';
    } else if (/\b(ayuda|help|que puedes|qué puedes|capacidades)\b/.test(mensaje)) {
        analysis.intent = 'help';
    } else if (/\b(estadística|estadísticas|resumen|total|cantidad)\b/.test(mensaje)) {
        analysis.intent = 'statistics';
    } else if (/\b(comparar|versus|diferencia)\b/.test(mensaje)) {
        analysis.intent = 'comparison';
    }
    
    return analysis;
}
async function handleTeacherQuery(analysis, mensaje) {
    try {
        let baseQuery = `
            SELECT 
                CONCAT(u.nombre, ' ', u.apellido) as profesor,
                p.numero_empleado,
                c.nombre as carrera,
                p.titulo_academico,
                p.especialidad,
                p.experiencia_años,
                p.es_tutor,
                COUNT(DISTINCT pag.asignatura_id) as asignaturas_impartidas,
                COUNT(DISTINCT cal.id) as estudiantes_evaluados,
                AVG(cal.calificacion_final) as promedio_estudiantes,
                COUNT(DISTINCT CASE WHEN cal.estatus = 'aprobado' THEN cal.id END) as estudiantes_aprobados,
                ROUND((COUNT(DISTINCT CASE WHEN cal.estatus = 'aprobado' THEN cal.id END) * 100.0 / 
                       NULLIF(COUNT(DISTINCT cal.id), 0)), 2) as porcentaje_aprobacion
            FROM profesores p
            INNER JOIN usuarios u ON p.usuario_id = u.id
            INNER JOIN carreras c ON p.carrera_id = c.id
            LEFT JOIN profesor_asignatura_grupo pag ON p.id = pag.profesor_id AND pag.activo = TRUE
            LEFT JOIN calificaciones cal ON p.id = cal.profesor_id AND cal.calificacion_final IS NOT NULL
            WHERE p.activo = TRUE AND u.activo = TRUE
        `;
        
        let params = [];
        let whereClause = '';
        if (analysis.scope === 'tsu') {
            whereClause += ' AND c.duracion_cuatrimestres = 6';
        } else if (analysis.scope === 'ingenieria') {
            whereClause += ' AND c.duracion_cuatrimestres = 9';
        }
        
        baseQuery += whereClause + `
            GROUP BY p.id, u.nombre, u.apellido, p.numero_empleado, c.nombre, 
                     p.titulo_academico, p.especialidad, p.experiencia_años, p.es_tutor
            HAVING estudiantes_evaluados > 0
        `;
        if (analysis.qualifier === 'best') {
            baseQuery += ' ORDER BY porcentaje_aprobacion DESC, promedio_estudiantes DESC, experiencia_años DESC';
        } else if (analysis.qualifier === 'worst') {
            baseQuery += ' ORDER BY porcentaje_aprobacion ASC, promedio_estudiantes ASC';
        } else {
            baseQuery += ' ORDER BY experiencia_años DESC, porcentaje_aprobacion DESC';
        }
        
        baseQuery += ' LIMIT 10';
        
        const [rows] = await db.execute(baseQuery, params);
        
        if (rows.length === 0) {
            return `No encontré profesores que coincidan con tu búsqueda "${mensaje}". 🤔

¿Podrías intentar con:
• "¿Cuál es el mejor profesor de TSU?"
• "Profesor con más experiencia en ingeniería"
• "¿Qué docente tiene mejor rendimiento con estudiantes?"`;
        }
        
        let respuesta = '';
        
        if (analysis.qualifier === 'best') {
            respuesta = `🏆 **Los mejores profesores según tu consulta:**\n\n`;
        } else if (analysis.qualifier === 'worst') {
            respuesta = `📊 **Profesores que podrían necesitar apoyo:**\n\n`;
        } else {
            respuesta = `👨‍🏫 **Información de profesores:**\n\n`;
        }
        
        if (analysis.scope === 'tsu') {
            respuesta += `🎯 **Filtrado por:** Carreras TSU\n\n`;
        } else if (analysis.scope === 'ingenieria') {
            respuesta += `🎯 **Filtrado por:** Carreras de Ingeniería\n\n`;
        }
        
        rows.forEach((profesor, index) => {
            const posicion = index === 0 && analysis.qualifier === 'best' ? '🥇' : 
                            index === 1 && analysis.qualifier === 'best' ? '🥈' : 
                            index === 2 && analysis.qualifier === 'best' ? '🥉' : `${index + 1}.`;
            
            respuesta += `${posicion} **${profesor.profesor}**\n`;
            respuesta += `   🎓 Carrera: ${profesor.carrera}\n`;
            respuesta += `   📚 Asignaturas: ${profesor.asignaturas_impartidas}\n`;
            respuesta += `   👥 Estudiantes evaluados: ${profesor.estudiantes_evaluados}\n`;
            respuesta += `   📊 Promedio estudiantes: ${parseFloat(profesor.promedio_estudiantes || 0).toFixed(2)}\n`;
            respuesta += `   ✅ Tasa de aprobación: ${profesor.porcentaje_aprobacion || 0}%\n`;
            respuesta += `   ⏱️ Experiencia: ${profesor.experiencia_años} años\n`;
            if (profesor.es_tutor) {
                respuesta += `   🎯 Es tutor grupal\n`;
            }
            respuesta += `\n`;
        });
        const mejor = rows[0];
        if (analysis.qualifier === 'best') {
            respuesta += `💡 **${mejor.profesor}** destaca con una tasa de aprobación del ${mejor.porcentaje_aprobacion}% y un promedio estudiantil de ${parseFloat(mejor.promedio_estudiantes).toFixed(2)}.`;
        }
        
        return respuesta;
        
    } catch (error) {
        console.error('Error en handleTeacherQuery:', error);
        return `Tuve un problema buscando información sobre profesores. ¿Podrías ser más específico?

Ejemplos:
• "¿Cuál es el mejor profesor de matemáticas?"
• "Profesor con más experiencia"
• "¿Qué docente tiene mejor tasa de aprobación?"`;
    }
}
async function handleStudentQuery(analysis, mensaje) {
    try {
        let baseQuery = `
            SELECT 
                CONCAT(u.nombre, ' ', u.apellido) as estudiante,
                a.matricula,
                c.nombre as carrera,
                g.codigo as grupo,
                a.cuatrimestre_actual,
                a.promedio_general,
                COUNT(DISTINCT cal.id) as materias_evaluadas,
                SUM(CASE WHEN cal.estatus = 'aprobado' THEN 1 ELSE 0 END) as materias_aprobadas,
                SUM(CASE WHEN cal.estatus = 'reprobado' THEN 1 ELSE 0 END) as materias_reprobadas,
                AVG(cal.calificacion_final) as promedio_calificaciones
            FROM alumnos a
            INNER JOIN usuarios u ON a.usuario_id = u.id
            INNER JOIN carreras c ON a.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON a.id = ag.alumno_id AND ag.activo = TRUE
            LEFT JOIN grupos g ON ag.grupo_id = g.id
            LEFT JOIN calificaciones cal ON a.id = cal.alumno_id AND cal.calificacion_final IS NOT NULL
            WHERE u.activo = TRUE AND a.estado_alumno = 'activo'
        `;

        
        let params = [];
        let whereClause = '';
        if (analysis.scope === 'tsu') {
            whereClause += ' AND c.duracion_cuatrimestres = 6';
        } else if (analysis.scope === 'ingenieria') {
            whereClause += ' AND c.duracion_cuatrimestres = 9';
        }
        
        if (analysis.scope && analysis.scope.startsWith('cuatrimestre_')) {
            const cuatrimestre = analysis.scope.split('_')[1];
            whereClause += ' AND a.cuatrimestre_actual = ?';
            params.push(parseInt(cuatrimestre));
        }
        
        if (analysis.scope && analysis.scope.startsWith('grupo_')) {
            const grupo = analysis.scope.split('_')[1];
            whereClause += ' AND g.codigo = ?';
            params.push(grupo);
        }
        
        baseQuery += whereClause + `
            GROUP BY a.id, u.nombre, u.apellido, a.matricula, c.nombre, g.codigo, 
                     a.cuatrimestre_actual, a.promedio_general
            HAVING materias_evaluadas > 0
        `;
        if (analysis.qualifier === 'best') {
            baseQuery += ' ORDER BY a.promedio_general DESC, promedio_calificaciones DESC';
        } else if (analysis.qualifier === 'worst') {
            baseQuery += ' ORDER BY materias_reprobadas DESC, a.promedio_general ASC';
        } else {
            baseQuery += ' ORDER BY a.promedio_general DESC';
        }
        
        baseQuery += ' LIMIT 10';
        
        const [rows] = await db.execute(baseQuery, params);
        
        if (rows.length === 0) {
            return `No encontré estudiantes que coincidan con "${mensaje}". 🤔

¿Podrías intentar:
• "¿Cuál es el mejor estudiante del cuatrimestre 2?"
• "Estudiante más reprobado de TSU"
• "¿Quién tiene mejor promedio en el grupo A?"`;
        }
        
        let respuesta = '';
        
        if (analysis.qualifier === 'best') {
            respuesta = `🌟 **Los estudiantes más sobresalientes:**\n\n`;
        } else if (analysis.qualifier === 'worst') {
            respuesta = `📊 **Estudiantes que necesitan apoyo académico:**\n\n`;
        } else {
            respuesta = `👥 **Información de estudiantes:**\n\n`;
        }
        if (analysis.scope === 'tsu') respuesta += `🎯 **Filtro:** Carreras TSU\n`;
        if (analysis.scope === 'ingenieria') respuesta += `🎯 **Filtro:** Carreras de Ingeniería\n`;
        if (analysis.scope && analysis.scope.startsWith('cuatrimestre_')) {
            respuesta += `🎯 **Filtro:** Cuatrimestre ${analysis.scope.split('_')[1]}\n`;
        }
        if (analysis.scope && analysis.scope.startsWith('grupo_')) {
            respuesta += `🎯 **Filtro:** Grupo ${analysis.scope.split('_')[1]}\n`;
        }
        respuesta += `\n`;
        
        rows.forEach((estudiante, index) => {
            const posicion = index === 0 && analysis.qualifier === 'best' ? '🥇' : 
                            index === 1 && analysis.qualifier === 'best' ? '🥈' : 
                            index === 2 && analysis.qualifier === 'best' ? '🥉' : `${index + 1}.`;
            
            respuesta += `${posicion} **${estudiante.estudiante}**\n`;
            respuesta += `   📋 Matrícula: ${estudiante.matricula}\n`;
            respuesta += `   🎓 Carrera: ${estudiante.carrera}\n`;
            if (estudiante.grupo) {
                respuesta += `   👥 Grupo: ${estudiante.grupo}\n`;
            }
            respuesta += `   📈 Promedio general: ${parseFloat(estudiante.promedio_general || 0).toFixed(2)}\n`;
            respuesta += `   ✅ Materias aprobadas: ${estudiante.materias_aprobadas || 0}\n`;
            if (estudiante.materias_reprobadas > 0) {
                respuesta += `   ❌ Materias reprobadas: ${estudiante.materias_reprobadas}\n`;
            }

        });
        
        const destacado = rows[0];
        if (analysis.qualifier === 'best') {
            respuesta += `🏆 **${destacado.estudiante}** lidera con un promedio de ${parseFloat(destacado.promedio_general).toFixed(2)}. ¡Excelente rendimiento!`;
        } else if (analysis.qualifier === 'worst' && destacado.materias_reprobadas > 0) {
            respuesta += `💡 **${destacado.estudiante}** podría beneficiarse de tutoría adicional (${destacado.materias_reprobadas} materias reprobadas).`;
        }
        
        return respuesta;
        
    } catch (error) {
        console.error('Error en handleStudentQuery:', error);
        return `Tuve un problema buscando información sobre estudiantes. ¿Podrías reformular tu pregunta?

Ejemplos:
• "¿Cuál es el mejor estudiante del cuatrimestre 3?"
• "Estudiante más reprobado de ingeniería"
• "¿Quién tiene mejor promedio en TSU?"`;
    }
}
async function handleGroupQuery(analysis, mensaje) {
    try {
        let baseQuery = `
            SELECT 
                g.codigo as grupo,
                c.nombre as carrera,
                g.cuatrimestre,
                COUNT(DISTINCT ag.alumno_id) as total_estudiantes,
                g.capacidad_maxima,
                ROUND((COUNT(DISTINCT ag.alumno_id) * 100.0 / g.capacidad_maxima), 2) as porcentaje_ocupacion,
                AVG(a.promedio_general) as promedio_grupo,
                COUNT(DISTINCT cal.id) as evaluaciones_totales,
                AVG(cal.calificacion_final) as promedio_calificaciones,
                COUNT(DISTINCT CASE WHEN cal.estatus = 'aprobado' THEN cal.id END) as aprobaciones,
                ROUND((COUNT(DISTINCT CASE WHEN cal.estatus = 'aprobado' THEN cal.id END) * 100.0 / 
                       NULLIF(COUNT(DISTINCT cal.id), 0)), 2) as tasa_aprobacion,
                CONCAT(u.nombre, ' ', u.apellido) as profesor_tutor
            FROM grupos g
            INNER JOIN carreras c ON g.carrera_id = c.id
            LEFT JOIN alumnos_grupos ag ON g.id = ag.grupo_id AND ag.activo = TRUE
            LEFT JOIN alumnos a ON ag.alumno_id = a.id
            LEFT JOIN calificaciones cal ON a.id = cal.alumno_id AND cal.calificacion_final IS NOT NULL
            LEFT JOIN profesores p ON g.profesor_tutor_id = p.id
            LEFT JOIN usuarios u ON p.usuario_id = u.id
            WHERE g.activo = TRUE
        `;
        
        let params = [];
        let whereClause = '';
        if (analysis.scope === 'tsu') {
            whereClause += ' AND c.duracion_cuatrimestres = 6';
        } else if (analysis.scope === 'ingenieria') {
            whereClause += ' AND c.duracion_cuatrimestres = 9';
        }
        
        if (analysis.scope && analysis.scope.startsWith('cuatrimestre_')) {
            const cuatrimestre = analysis.scope.split('_')[1];
            whereClause += ' AND g.cuatrimestre = ?';
            params.push(parseInt(cuatrimestre));
        }
        
        baseQuery += whereClause + `
            GROUP BY g.id, g.codigo, c.nombre, g.cuatrimestre, g.capacidad_maxima, u.nombre, u.apellido
            HAVING total_estudiantes > 0
        `;
        if (analysis.qualifier === 'best') {
            baseQuery += ' ORDER BY promedio_grupo DESC, tasa_aprobacion DESC';
        } else if (analysis.qualifier === 'worst') {
            baseQuery += ' ORDER BY promedio_grupo ASC, tasa_aprobacion ASC';
        } else {
            baseQuery += ' ORDER BY promedio_grupo DESC';
        }
        
        baseQuery += ' LIMIT 10';
        
        const [rows] = await db.execute(baseQuery, params);
        if (rows.length === 0) {
            return `No encontré grupos que coincidan con "${mensaje}". 🤔

¿Podrías intentar:
• "¿Cuál es el mejor grupo del cuatrimestre 3?"
• "Grupo con peor rendimiento en TSU"
• "¿Qué grupo tiene mejor promedio?"`;
        }
        
        let respuesta = '';
        
        if (analysis.qualifier === 'best') {
            respuesta = `🏆 **Los grupos con mejor rendimiento:**\n\n`;
        } else if (analysis.qualifier === 'worst') {
            respuesta = `📊 **Grupos que necesitan atención:**\n\n`;
        } else {
            respuesta = `👥 **Información de grupos:**\n\n`;
        }
        if (analysis.scope === 'tsu') respuesta += `🎯 **Filtro:** Carreras TSU\n`;
        if (analysis.scope === 'ingenieria') respuesta += `🎯 **Filtro:** Carreras de Ingeniería\n`;
        if (analysis.scope && analysis.scope.startsWith('cuatrimestre_')) {
            respuesta += `🎯 **Filtro:** Cuatrimestre ${analysis.scope.split('_')[1]}\n`;
        }
        respuesta += `\n`;
        
        rows.forEach((grupo, index) => {
            const posicion = index === 0 && analysis.qualifier === 'best' ? '🥇' : 
                            index === 1 && analysis.qualifier === 'best' ? '🥈' : 
                            index === 2 && analysis.qualifier === 'best' ? '🥉' : `${index + 1}.`;
            
            respuesta += `${posicion} **Grupo ${grupo.grupo}**\n`;
            respuesta += `   🎓 Carrera: ${grupo.carrera}\n`;
            respuesta += `   📊 Cuatrimestre: ${grupo.cuatrimestre}\n`;
            respuesta += `   👥 Estudiantes: ${grupo.total_estudiantes}/${grupo.capacidad_maxima} (${grupo.porcentaje_ocupacion}%)\n`;
            respuesta += `   📈 Promedio grupal: ${parseFloat(grupo.promedio_grupo || 0).toFixed(2)}\n`;
            if (grupo.tasa_aprobacion) {
                respuesta += `   ✅ Tasa de aprobación: ${grupo.tasa_aprobacion}%\n`;
            }
            if (grupo.profesor_tutor) {
                respuesta += `   👨‍🏫 Tutor: ${grupo.profesor_tutor}\n`;
            }
            respuesta += `\n`;
        });
        const destacado = rows[0];
        if (analysis.qualifier === 'best') {
            respuesta += `🌟 **El grupo ${destacado.grupo}** sobresale con un promedio de ${parseFloat(destacado.promedio_grupo).toFixed(2)}. ¡Excelente trabajo en equipo!`;
        } else if (analysis.qualifier === 'worst') {
            respuesta += `💡 **El grupo ${destacado.grupo}** podría beneficiarse de apoyo adicional (promedio: ${parseFloat(destacado.promedio_grupo).toFixed(2)}).`;
        }
        
        return respuesta;
        
    } catch (error) {
        console.error('Error en handleGroupQuery:', error);
        return `Tuve un problema analizando los grupos. ¿Podrías ser más específico?

Ejemplos:
• "¿Cuál es el mejor grupo de TSU?"
• "Grupo con peor rendimiento del cuatrimestre 2"
• "¿Qué grupo tiene más estudiantes?"`;
    }
}
async function handleCareerQuery(analysis, mensaje) {
    try {
        const [rows] = await db.execute(`
            SELECT 
                c.nombre as carrera,
                c.codigo,
                c.duracion_cuatrimestres,
                c.descripcion,
                COUNT(DISTINCT a.id) as total_estudiantes,
                COUNT(DISTINCT p.id) as total_profesores,
                COUNT(DISTINCT asig.id) as total_asignaturas,
                AVG(a.promedio_general) as promedio_carrera,
                COUNT(DISTINCT cal.id) as evaluaciones_totales,
                SUM(CASE WHEN cal.estatus = 'aprobado' THEN 1 ELSE 0 END) as aprobaciones,
                ROUND((SUM(CASE WHEN cal.estatus = 'aprobado' THEN 1 ELSE 0 END) * 100.0 / 
                       NULLIF(COUNT(cal.id), 0)), 2) as porcentaje_aprobacion
            FROM carreras c
            LEFT JOIN alumnos a ON c.id = a.carrera_id
            LEFT JOIN usuarios u ON a.usuario_id = u.id
            LEFT JOIN profesores p ON c.id = p.carrera_id AND p.activo = TRUE
            LEFT JOIN asignaturas asig ON c.id = asig.carrera_id AND asig.activa = TRUE
            LEFT JOIN calificaciones cal ON a.id = cal.alumno_id AND cal.calificacion_final IS NOT NULL
            WHERE c.activa = TRUE AND (u.activo = TRUE OR a.id IS NULL)
            GROUP BY c.id, c.nombre, c.codigo, c.duracion_cuatrimestres, c.descripcion
            ORDER BY porcentaje_aprobacion DESC, promedio_carrera DESC
        `);
        
        if (rows.length === 0) {
            return `No encontré información sobre carreras. 🤔`;
        }
        
        let respuesta = `🎓 **Información de carreras en DTAI:**\n\n`;
        const tsuCarreras = rows.filter(c => c.duracion_cuatrimestres === 6);
        const ingCarreras = rows.filter(c => c.duracion_cuatrimestres === 9);
        
        if (analysis.scope === 'tsu' || (!analysis.scope && tsuCarreras.length > 0)) {
            respuesta += `📚 **TÉCNICO SUPERIOR UNIVERSITARIO (TSU):**\n\n`;
            tsuCarreras.forEach((carrera, index) => {
                respuesta += `${index + 1}. **${carrera.carrera}** (${carrera.codigo})\n`;
                respuesta += `   👥 Estudiantes: ${carrera.total_estudiantes || 0}\n`;
                respuesta += `   👨‍🏫 Profesores: ${carrera.total_profesores || 0}\n`;
                respuesta += `   📚 Asignaturas: ${carrera.total_asignaturas || 0}\n`;
                respuesta += `   📊 Promedio: ${parseFloat(carrera.promedio_carrera || 0).toFixed(2)}\n`;
                if (carrera.porcentaje_aprobacion) {
                    respuesta += `   ✅ Aprobación: ${carrera.porcentaje_aprobacion}%\n`;
                }
                respuesta += `\n`;
            });
        }
        
        if (analysis.scope === 'ingenieria' || (!analysis.scope && ingCarreras.length > 0)) {
            respuesta += `🔬 **INGENIERÍA:**\n\n`;
            ingCarreras.forEach((carrera, index) => {
                respuesta += `${index + 1}. **${carrera.carrera}** (${carrera.codigo})\n`;
                respuesta += `   👥 Estudiantes: ${carrera.total_estudiantes || 0}\n`;
                respuesta += `   👨‍🏫 Profesores: ${carrera.total_profesores || 0}\n`;
                respuesta += `   📚 Asignaturas: ${carrera.total_asignaturas || 0}\n`;
                respuesta += `   📊 Promedio: ${parseFloat(carrera.promedio_carrera || 0).toFixed(2)}\n`;
                if (carrera.porcentaje_aprobacion) {
                    respuesta += `   ✅ Aprobación: ${carrera.porcentaje_aprobacion}%\n`;
                }
                respuesta += `\n`;
            });
        }
        const mejorCarrera = rows[0];
        if (mejorCarrera.porcentaje_aprobacion) {
            respuesta += `🏆 **${mejorCarrera.carrera}** lidera con ${mejorCarrera.porcentaje_aprobacion}% de aprobación.`;
        }
        
        return respuesta;
        
    } catch (error) {
        console.error('Error en handleCareerQuery:', error);
        return `Tuve un problema consultando las carreras. ¿Podrías reformular tu pregunta?`;
    }
}
async function handleDirectiveQuery(analysis, mensaje) {
    try {
        const [rows] = await db.execute(`
            SELECT 
                CONCAT(u.nombre, ' ', u.apellido) as directivo,
                d.numero_empleado,
                d.cargo,
                d.nivel_acceso,
                c.nombre as carrera,
                d.fecha_nombramiento
            FROM directivos d
            INNER JOIN usuarios u ON d.usuario_id = u.id
            LEFT JOIN carreras c ON d.carrera_id = c.id
            WHERE u.activo = TRUE
            ORDER BY 
                CASE d.nivel_acceso 
                    WHEN 'director' THEN 1
                    WHEN 'subdirector' THEN 2
                    WHEN 'coordinador' THEN 3
                END,
                d.fecha_nombramiento DESC
        `);
        
        if (rows.length === 0) {
            return `No encontré información sobre directivos activos. 🤔`;
        }
        
        let respuesta = `👔 **Equipo directivo de DTAI** (${rows.length} personas):\n\n`;
        
        rows.forEach((directivo, index) => {
            const jerarquia = directivo.nivel_acceso === 'director' ? '🎯' : 
                             directivo.nivel_acceso === 'subdirector' ? '📋' : '⚙️';
            
            respuesta += `${index + 1}. ${jerarquia} **${directivo.directivo}**\n`;
            respuesta += `   📄 Cargo: ${directivo.cargo}\n`;
            respuesta += `   🏢 Nivel: ${directivo.nivel_acceso}\n`;
            if (directivo.carrera) {
                respuesta += `   🎓 Carrera: ${directivo.carrera}\n`;
            }
            respuesta += `   📅 Desde: ${new Date(directivo.fecha_nombramiento).getFullYear()}\n\n`;
        });
        
        respuesta += `💼 El equipo directivo está bien estructurado con ${rows.length} miembros activos.`;
        
        return respuesta;
        
    } catch (error) {
        console.error('Error en handleDirectiveQuery:', error);
        return `Tuve un problema consultando información de directivos.`;
    }
}
function handleGreeting() {
    const saludos = [
        `¡Hola! 👋 Soy tu asistente inteligente de DTAI. Puedo ayudarte con consultas muy específicas sobre estudiantes, profesores, grupos y todo lo relacionado con la división.`,
        
        `¡Hey! 🤖 ¿Qué tal? Estoy aquí para responder cualquier pregunta específica que tengas sobre DTAI. Desde "¿cuál es el mejor profesor?" hasta "¿qué estudiante necesita más apoyo?".`,
        
        `¡Buenas! 😊 Soy como tu asistente personal para datos de DTAI. Puedo ser muy específico y conversacional. ¿Qué te gustaría saber?`
    ];
    
    const saludo = saludos[Math.floor(Math.random() * saludos.length)];
    
    return saludo + `\n\n💡 **Ejemplos de lo que puedo hacer:**
• "¿Cuál es el mejor profesor de matemáticas?"
• "Estudiante más reprobado del cuatrimestre 2"
• "¿Qué grupo de TSU tiene mejor promedio?"
• "Compara el rendimiento entre carreras"
• "¿Quién necesita apoyo académico?"

¡Pregúntame como si fuera una conversación normal! 🚀`;
}
function handleHelp() {
    return `🤖 **¡Soy tu asistente conversacional de DTAI!**

Puedo entender y responder preguntas naturales como si fuera una persona. No necesitas comandos específicos.

🎯 **EJEMPLOS DE CONSULTAS ESPECÍFICAS:**

**Sobre profesores:**
• "¿Cuál es el mejor profesor de la carrera?"
• "Profesor con más experiencia en TSU"
• "¿Qué docente tiene mejor rendimiento?"
• "Profesor que necesita apoyo"

**Sobre estudiantes:**
• "¿Cuál es el alumno más reprobado del cuatrimestre 2?"
• "Mejor estudiante del grupo A"
• "¿Quién tiene el promedio más alto?"
• "Estudiantes en riesgo académico"

**Sobre grupos:**
• "¿Qué grupo tiene mejor rendimiento?"
• "Grupo con más problemas en TSU"
• "¿Cuál es el mejor grupo del cuatrimestre 3?"

**Comparaciones:**
• "Compara TSU vs Ingeniería"
• "¿Qué carrera tiene mejor promedio?"
• "Diferencias entre grupos"

💬 **SOY CONVERSACIONAL:**
Habla conmigo como hablarías con una persona. Entiendo contexto, sinónimos y puedo ser muy específico con los datos.

¿Qué información específica necesitas? 🚀`;
}
async function handleComparison(analysis, mensaje) {
    try {
        const [comparacion] = await db.execute(`
            SELECT 
                CASE 
                    WHEN c.duracion_cuatrimestres = 6 THEN 'TSU'
                    WHEN c.duracion_cuatrimestres = 9 THEN 'Ingeniería'
                END as tipo_carrera,
                COUNT(DISTINCT c.id) as total_carreras,
                COUNT(DISTINCT a.id) as total_estudiantes,
                COUNT(DISTINCT p.id) as total_profesores,
                AVG(a.promedio_general) as promedio_tipo,
                COUNT(DISTINCT cal.id) as evaluaciones_totales,
                SUM(CASE WHEN cal.estatus = 'aprobado' THEN 1 ELSE 0 END) as aprobaciones,
                ROUND((SUM(CASE WHEN cal.estatus = 'aprobado' THEN 1 ELSE 0 END) * 100.0 / 
                       NULLIF(COUNT(cal.id), 0)), 2) as porcentaje_aprobacion
            FROM carreras c
            LEFT JOIN alumnos a ON c.id = a.carrera_id
            LEFT JOIN usuarios u ON a.usuario_id = u.id
            LEFT JOIN profesores p ON c.id = p.carrera_id AND p.activo = TRUE
            LEFT JOIN calificaciones cal ON a.id = cal.alumno_id AND cal.calificacion_final IS NOT NULL
            WHERE c.activa = TRUE AND (u.activo = TRUE OR a.id IS NULL)
            GROUP BY tipo_carrera
            ORDER BY promedio_tipo DESC
        `);
        
        if (comparacion.length === 0) {
            return `No encontré datos suficientes para hacer comparaciones. 🤔`;
        }
        
        let respuesta = `📊 **Comparación TSU vs Ingeniería en DTAI:**\n\n`;
        
        comparacion.forEach((tipo, index) => {
            const emoji = tipo.tipo_carrera === 'TSU' ? '📚' : '🔬';
            const posicion = index === 0 ? '🥇' : '🥈';
            
            respuesta += `${posicion} ${emoji} **${tipo.tipo_carrera}**\n`;
            respuesta += `   🎓 Carreras: ${tipo.total_carreras}\n`;
            respuesta += `   👥 Estudiantes: ${tipo.total_estudiantes}\n`;
            respuesta += `   👨‍🏫 Profesores: ${tipo.total_profesores}\n`;
            respuesta += `   📊 Promedio: ${parseFloat(tipo.promedio_tipo || 0).toFixed(2)}\n`;
            if (tipo.porcentaje_aprobacion) {
                respuesta += `   ✅ Aprobación: ${tipo.porcentaje_aprobacion}%\n`;
            }
            respuesta += `\n`;
        });
        if (comparacion.length >= 2) {
            const mejor = comparacion[0];
            const diferencia = parseFloat(comparacion[0].promedio_tipo) - parseFloat(comparacion[1].promedio_tipo);
            
            respuesta += `🎯 **Análisis:** ${mejor.tipo_carrera} lidera con un promedio ${diferencia.toFixed(2)} puntos superior. `;
            
            if (mejor.porcentaje_aprobacion > comparacion[1].porcentaje_aprobacion) {
                respuesta += `También tiene mejor tasa de aprobación.`;
            }
        }
        
        return respuesta;
        
    } catch (error) {
        console.error('Error en handleComparison:', error);
        return `Tuve un problema haciendo la comparación. ¿Podrías ser más específico sobre qué quieres comparar?`;
    }
}
async function handleStatistics(analysis, mensaje) {
    try {
        const [estudiantes] = await db.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN a.estado_alumno = 'activo' THEN 1 ELSE 0 END) as activos,
                SUM(CASE WHEN a.estado_alumno = 'egresado' THEN 1 ELSE 0 END) as egresados,
                AVG(a.promedio_general) as promedio_general
            FROM alumnos a
            INNER JOIN usuarios u ON a.usuario_id = u.id
            WHERE u.activo = TRUE
        `);
        
        const [profesores] = await db.execute(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN p.es_tutor THEN 1 ELSE 0 END) as tutores
            FROM profesores p
            INNER JOIN usuarios u ON p.usuario_id = u.id
            WHERE p.activo = TRUE AND u.activo = TRUE
        `);
        
        const [carreras] = await db.execute(`
            SELECT COUNT(*) as total FROM carreras WHERE activa = TRUE
        `);
        
        const est = estudiantes[0];
        const prof = profesores[0];
        const carr = carreras[0];
        
        return `📊 **Estadísticas generales de DTAI:**

🎓 **Estudiantes:**
   • Total: ${est.total}
   • Activos: ${est.activos}
   • Egresados: ${est.egresados}
   • Promedio general: ${parseFloat(est.promedio_general || 0).toFixed(2)}

👨‍🏫 **Profesores:**
   • Total activos: ${prof.total}
   • Tutores: ${prof.tutores}

🏫 **Carreras activas:** ${carr.total}

💡 La división mantiene un crecimiento estable con ${est.activos} estudiantes activos y ${prof.total} profesores comprometidos con la excelencia académica.

¿Te interesa algún dato más específico?`;
        
    } catch (error) {
        console.error('Error en handleStatistics:', error);
        return `Tuve un problema obteniendo las estadísticas. ¿Podrías preguntar algo más específico?`;
    }
}
async function handleIntelligentSearch(mensaje, analysis) {
    try {
        const palabrasClave = mensaje.toLowerCase().split(' ').filter(word => word.length > 2);
        let resultados = [];
        for (const palabra of palabrasClave.slice(0, 3)) { 
            const [estudiantes] = await db.execute(`
                SELECT 
                    CONCAT(u.nombre, ' ', u.apellido) as nombre,
                    a.matricula,
                    c.nombre as carrera,
                    a.promedio_general,
                    'estudiante' as tipo
                FROM alumnos a
                INNER JOIN usuarios u ON a.usuario_id = u.id
                INNER JOIN carreras c ON a.carrera_id = c.id
                WHERE (LOWER(u.nombre) LIKE ? OR LOWER(u.apellido) LIKE ? OR a.matricula LIKE ?)
                AND u.activo = TRUE
                LIMIT 2
            `, [`%${palabra}%`, `%${palabra}%`, `%${palabra}%`]);
            
            if (estudiantes.length > 0) {
                resultados = [...resultados, ...estudiantes];
            }
        }
        
        if (resultados.length > 0) {
            let respuesta = `🔍 **Encontré información relacionada con "${mensaje}":**\n\n`;
            
            resultados.slice(0, 5).forEach((resultado, index) => {
                respuesta += `${index + 1}. 👤 **${resultado.nombre}**\n`;
                respuesta += `   📋 Matrícula: ${resultado.matricula}\n`;
                respuesta += `   🎓 Carrera: ${resultado.carrera}\n`;
                respuesta += `   📊 Promedio: ${parseFloat(resultado.promedio_general || 0).toFixed(2)}\n\n`;
            });
            
            respuesta += `💡 ¿Necesitas información más específica sobre alguno de estos estudiantes?`;
            return respuesta;
        }
        return `🤔 No encontré información específica sobre "${mensaje}".

Pero puedo ayudarte con consultas como:

🎯 **Consultas específicas:**
• "¿Cuál es el mejor profesor de [materia]?"
• "Estudiante más reprobado del cuatrimestre [número]"
• "¿Qué grupo tiene mejor promedio en TSU?"
• "Compara el rendimiento entre carreras"

🔍 **O búsquedas por nombre:**
• Menciona nombres de estudiantes, profesores o grupos
• Pregunta sobre carreras específicas
• Solicita análisis de rendimiento

¿Podrías ser más específico? Estoy aquí para ayudarte con datos muy detallados. 😊`;
        
    } catch (error) {
        console.error('Error en handleIntelligentSearch:', error);
        return `Interesante pregunta sobre "${mensaje}". 🤔

Aunque no pude procesarla completamente, puedo ayudarte con información muy específica sobre:

📊 **Profesores:** rendimiento, experiencia, materias
👥 **Estudiantes:** promedios, rankings, grupos
🏫 **Grupos:** comparaciones, rendimiento
🎓 **Carreras:** estadísticas, comparaciones

¿Podrías reformular tu pregunta de manera más directa? Por ejemplo:
• "¿Cuál es el mejor [algo] de [contexto]?"
• "¿Quién tiene más/menos [característica]?"

¡Estoy aquí para ayudarte! 🚀`;
    }
}

export default router;