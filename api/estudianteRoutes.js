import express from 'express';
import { db } from '../index.js';
import { verifyTokenEstudiante } from '../middleware/auth.js';

const router = express.Router();

router.get('/alumno/perfil', verifyTokenEstudiante, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                a.id,
                a.matricula,
                a.cuatrimestre_actual,
                a.fecha_ingreso,
                a.telefono,
                a.direccion,
                a.fecha_nacimiento,
                a.estado_alumno,
                a.promedio_general,
                u.nombre,
                u.apellido,
                u.correo,
                c.nombre AS carrera,
                c.codigo AS codigo_carrera,
                c.duracion_cuatrimestres
            FROM alumnos a
            INNER JOIN usuarios u ON a.usuario_id = u.id
            INNER JOIN carreras c ON a.carrera_id = c.id
            WHERE a.id = ?
        `, [req.alumno.alumno_id]);

        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                message: 'Estudiante no encontrado' 
            });
        }

        res.json({
            success: true,
            data: rows[0]
        });
    } catch (error) {
        console.error('Error al obtener perfil del estudiante:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error interno del servidor' 
        });
    }
});

router.get('/alumno/calificaciones', verifyTokenEstudiante, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                c.id,
                c.parcial_1,
                c.parcial_2,
                c.parcial_3,
                c.calificacion_ordinario,
                c.calificacion_extraordinario,
                c.calificacion_final,
                c.estatus,
                c.observaciones,
                c.ciclo_escolar,
                c.fecha_captura,
                a.nombre AS asignatura,
                a.codigo AS codigo_asignatura,
                a.cuatrimestre,
                
                CONCAT(u.nombre, ' ', u.apellido) AS profesor
            FROM calificaciones c
            INNER JOIN asignaturas a ON c.asignatura_id = a.id
            INNER JOIN profesores p ON c.profesor_id = p.id
            INNER JOIN usuarios u ON p.usuario_id = u.id
            WHERE c.alumno_id = ?
            ORDER BY a.cuatrimestre, a.nombre
        `, [req.alumno.alumno_id]);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error al obtener calificaciones:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error interno del servidor' 
        });
    }
});

router.get('/alumno/reportes', verifyTokenEstudiante, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                r.id,
                r.tipo_riesgo,
                r.nivel_riesgo,
                r.descripcion,
                r.observaciones,
                r.acciones_recomendadas,
                r.fecha_reporte,
                r.fecha_seguimiento,
                r.estado,
                r.resolucion,
                CONCAT(u.nombre, ' ', u.apellido) AS profesor
            FROM reportes_riesgo r
            INNER JOIN profesores p ON r.profesor_id = p.id
            INNER JOIN usuarios u ON p.usuario_id = u.id
            WHERE r.alumno_id = ? AND r.estado != 'cerrado'
            ORDER BY r.fecha_reporte DESC
        `, [req.alumno.alumno_id]);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error al obtener reportes:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error interno del servidor' 
        });
    }
});

router.get('/alumno/horarios', verifyTokenEstudiante, async (req, res) => {
    try {
        const [alumnoGrupo] = await db.execute(`
            SELECT grupo_id 
            FROM alumnos_grupos 
            WHERE alumno_id = ? AND activo = 1
        `, [req.alumno.alumno_id]);

        if (alumnoGrupo.length === 0) {
            return res.json({
                success: true,
                data: []
            });
        }

        const grupoId = alumnoGrupo[0].grupo_id;

        const [rows] = await db.execute(`
            SELECT 
                h.id,
                h.dia_semana,
                h.hora_inicio,
                h.hora_fin,
                h.aula,
                h.tipo_clase,
                a.nombre AS asignatura,
                a.codigo AS codigo_asignatura,
                CONCAT(u.nombre, ' ', u.apellido) AS profesor
            FROM horarios h
            INNER JOIN profesor_asignatura_grupo pag ON h.profesor_asignatura_grupo_id = pag.id
            INNER JOIN asignaturas a ON pag.asignatura_id = a.id
            INNER JOIN profesores p ON pag.profesor_id = p.id
            INNER JOIN usuarios u ON p.usuario_id = u.id
            WHERE pag.grupo_id = ? AND h.activo = 1 AND pag.activo = 1
            ORDER BY 
                FIELD(h.dia_semana, 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'),
                h.hora_inicio
        `, [grupoId]);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error al obtener horarios:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error interno del servidor' 
        });
    }
});

router.get('/alumno/solicitudes-ayuda', verifyTokenEstudiante, async (req, res) => {
    try {
        const [rows] = await db.execute(`
            SELECT 
                s.id,
                s.tipo_problema,
                s.descripcion_problema,
                s.urgencia,
                s.contacto_preferido,
                s.estado,
                s.respuesta,
                s.fecha_solicitud,
                s.fecha_respuesta,
                CASE 
                    WHEN s.asignado_a IS NOT NULL THEN CONCAT(u.nombre, ' ', u.apellido)
                    ELSE NULL
                END AS asignado_a_nombre
            FROM solicitudes_ayuda s
            LEFT JOIN directivos d ON s.asignado_a = d.id
            LEFT JOIN usuarios u ON d.usuario_id = u.id
            WHERE s.alumno_id = ?
            ORDER BY s.fecha_solicitud DESC
        `, [req.alumno.alumno_id]);

        res.json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('Error al obtener solicitudes de ayuda:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error interno del servidor' 
        });
    }
});

router.post('/alumno/solicitud-ayuda', verifyTokenEstudiante, async (req, res) => {
    try {
        const { tipo_problema, descripcion_problema, urgencia, contacto_preferido } = req.body;

        if (!tipo_problema || !descripcion_problema) {
            return res.status(400).json({ 
                success: false,
                message: 'Tipo de problema y descripción son requeridos' 
            });
        }

        const [result] = await db.execute(`
            INSERT INTO solicitudes_ayuda (
                alumno_id, 
                tipo_problema, 
                descripcion_problema, 
                urgencia, 
                contacto_preferido
            ) VALUES (?, ?, ?, ?, ?)
        `, [req.alumno.alumno_id, tipo_problema, descripcion_problema, urgencia || 'media', contacto_preferido || 'correo']);

        res.status(201).json({ 
            success: true,
            message: 'Solicitud de ayuda creada exitosamente',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Error al crear solicitud de ayuda:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error interno del servidor' 
        });
    }
});

router.put('/alumno/perfil', verifyTokenEstudiante, async (req, res) => {
    try {
        const { telefono, direccion } = req.body;

        await db.execute(`
            UPDATE alumnos 
            SET telefono = ?, direccion = ?
            WHERE id = ?
        `, [telefono, direccion, req.alumno.alumno_id]);

        res.json({ 
            success: true,
            message: 'Perfil actualizado exitosamente' 
        });
    } catch (error) {
        console.error('Error al actualizar perfil:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error interno del servidor' 
        });
    }
});


router.get('/chat-ayuda/:solicitudId', verifyTokenEstudiante, async (req, res) => {
    try {
        const { solicitudId } = req.params;
        
        const [verificacion] = await db.execute(`
            SELECT id FROM solicitudes_ayuda 
            WHERE id = ? AND alumno_id = ?
        `, [solicitudId, req.alumno.alumno_id]);

        if (verificacion.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta solicitud'
            });
        }

        const [mensajes] = await db.execute(`
            SELECT 
                c.id,
                c.mensaje,
                c.tipo_usuario,
                c.fecha_mensaje,
                CASE 
                    WHEN c.tipo_usuario = 'alumno' THEN CONCAT(ua.nombre, ' ', ua.apellido)
                    WHEN c.tipo_usuario = 'profesor' THEN CONCAT(up.nombre, ' ', up.apellido)
                    WHEN c.tipo_usuario = 'directivo' THEN CONCAT(ud.nombre, ' ', ud.apellido)
                    ELSE 'Sistema'
                END as nombre_usuario
            FROM chat_ayuda c
            LEFT JOIN usuarios ua ON c.usuario_id = ua.id AND c.tipo_usuario = 'alumno'
            LEFT JOIN usuarios up ON c.usuario_id = up.id AND c.tipo_usuario = 'profesor'
            LEFT JOIN usuarios ud ON c.usuario_id = ud.id AND c.tipo_usuario = 'directivo'
            WHERE c.solicitud_id = ?
            ORDER BY c.fecha_mensaje ASC
        `, [solicitudId]);

        res.json({
            success: true,
            data: mensajes
        });
    } catch (error) {
        console.error('Error al obtener mensajes del chat:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.post('/chat-ayuda/:solicitudId', verifyTokenEstudiante, async (req, res) => {
    try {
        const { solicitudId } = req.params;
        const { mensaje } = req.body;

        if (!mensaje || !mensaje.trim()) {
            return res.status(400).json({
                success: false,
                message: 'El mensaje es requerido'
            });
        }

        const [verificacion] = await db.execute(`
            SELECT id FROM solicitudes_ayuda 
            WHERE id = ? AND alumno_id = ?
        `, [solicitudId, req.alumno.alumno_id]);

        if (verificacion.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'No tienes acceso a esta solicitud'
            });
        }

        const [result] = await db.execute(`
            INSERT INTO chat_ayuda (
                solicitud_id,
                usuario_id,
                mensaje,
                tipo_usuario
            ) VALUES (?, ?, ?, ?)
        `, [solicitudId, req.alumno.usuario_id, mensaje.trim(), 'alumno']);

        res.status(201).json({
            success: true,
            message: 'Mensaje enviado exitosamente',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Error al enviar mensaje:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});
router.get('/foro/categorias', verifyTokenEstudiante, async (req, res) => {
    try {
        const [categorias] = await db.execute(`
            SELECT 
                id,
                nombre,
                descripcion,
                color,
                icono,
                orden,
                activo
            FROM categorias_foro
            WHERE activo = 1
            ORDER BY orden ASC, nombre ASC
        `);

        res.json({
            success: true,
            data: categorias
        });
    } catch (error) {
        console.error('Error al obtener categorías del foro:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/foro/posts', verifyTokenEstudiante, async (req, res) => {
    try {
        const [posts] = await db.execute(`
            SELECT 
                p.id,
                p.titulo,
                p.contenido,
                p.es_fijado,
                p.es_cerrado,
                p.vistas,
                p.likes,
                p.fecha_creacion,
                p.fecha_actualizacion,
                u.nombre as autor_nombre,
                u.apellido as autor_apellido,
                CONCAT(u.nombre, ' ', u.apellido) as autor_nombre,
                cf.id as categoria_id,
                cf.nombre as categoria_nombre,
                cf.color as categoria_color,
                (SELECT COUNT(*) FROM foro_comentarios fc WHERE fc.post_id = p.id AND fc.activo = 1) as comentarios_count
            FROM foro_posts p
            INNER JOIN usuarios u ON p.usuario_id = u.id
            INNER JOIN categorias_foro cf ON p.categoria_id = cf.id
            WHERE p.activo = 1
            ORDER BY p.es_fijado DESC, p.fecha_creacion DESC
        `);

        res.json({
            success: true,
            data: posts
        });
    } catch (error) {
        console.error('Error al obtener posts del foro:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.post('/foro/posts', verifyTokenEstudiante, async (req, res) => {
    try {
        const { titulo, contenido, categoria_id } = req.body;

        if (!titulo || !contenido || !categoria_id) {
            return res.status(400).json({
                success: false,
                message: 'Título, contenido y categoría son requeridos'
            });
        }

        const [result] = await db.execute(`
            INSERT INTO foro_posts (
                usuario_id,
                categoria_id,
                titulo,
                contenido,
                activo
            ) VALUES (?, ?, ?, ?, 1)
        `, [req.alumno.usuario_id, categoria_id, titulo, contenido]);

        res.status(201).json({
            success: true,
            message: 'Post creado exitosamente',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Error al crear post:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/foro/posts/:postId', verifyTokenEstudiante, async (req, res) => {
    try {
        const { postId } = req.params;

        await db.execute(`
            UPDATE foro_posts 
            SET vistas = vistas + 1 
            WHERE id = ?
        `, [postId]);

        const [posts] = await db.execute(`
            SELECT 
                p.id,
                p.titulo,
                p.contenido,
                p.es_fijado,
                p.es_cerrado,
                p.vistas,
                p.likes,
                p.fecha_creacion,
                p.fecha_actualizacion,
                CONCAT(u.nombre, ' ', u.apellido) as autor_nombre,
                cf.nombre as categoria_nombre,
                cf.color as categoria_color
            FROM foro_posts p
            INNER JOIN usuarios u ON p.usuario_id = u.id
            INNER JOIN categorias_foro cf ON p.categoria_id = cf.id
            WHERE p.id = ? AND p.activo = 1
        `, [postId]);

        if (posts.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado'
            });
        }

        res.json({
            success: true,
            data: posts[0]
        });
    } catch (error) {
        console.error('Error al obtener post:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.get('/foro/posts/:postId/comentarios', verifyTokenEstudiante, async (req, res) => {
    try {
        const { postId } = req.params;

        const [comentarios] = await db.execute(`
            SELECT 
                c.id,
                c.comentario,
                c.likes,
                c.fecha_creacion,
                CONCAT(u.nombre, ' ', u.apellido) as autor_nombre
            FROM foro_comentarios c
            INNER JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.post_id = ? AND c.activo = 1
            ORDER BY c.fecha_creacion ASC
        `, [postId]);

        res.json({
            success: true,
            data: comentarios
        });
    } catch (error) {
        console.error('Error al obtener comentarios:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.post('/foro/posts/:postId/comentarios', verifyTokenEstudiante, async (req, res) => {
    try {
        const { postId } = req.params;
        const { comentario } = req.body;

        if (!comentario || !comentario.trim()) {
            return res.status(400).json({
                success: false,
                message: 'El comentario es requerido'
            });
        }

        const [verificacion] = await db.execute(`
            SELECT id FROM foro_posts 
            WHERE id = ? AND activo = 1
        `, [postId]);

        if (verificacion.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Post no encontrado'
            });
        }

        const [result] = await db.execute(`
            INSERT INTO foro_comentarios (
                post_id,
                usuario_id,
                comentario,
                activo
            ) VALUES (?, ?, ?, 1)
        `, [postId, req.alumno.usuario_id, comentario.trim()]);

        res.status(201).json({
            success: true,
            message: 'Comentario creado exitosamente',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Error al crear comentario:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.post('/foro/posts/:postId/like', verifyTokenEstudiante, async (req, res) => {
    try {
        const { postId } = req.params;

        const [existingLike] = await db.execute(`
            SELECT id FROM interacciones_foro 
            WHERE usuario_id = ? AND post_id = ? AND tipo_interaccion = 'like'
        `, [req.alumno.usuario_id, postId]);

        if (existingLike.length > 0) {
            await db.execute(`
                DELETE FROM interacciones_foro 
                WHERE usuario_id = ? AND post_id = ? AND tipo_interaccion = 'like'
            `, [req.alumno.usuario_id, postId]);

            await db.execute(`
                UPDATE foro_posts 
                SET likes = GREATEST(0, likes - 1)
                WHERE id = ?
            `, [postId]);

            res.json({
                success: true,
                message: 'Like removido'
            });
        } else {
            await db.execute(`
                INSERT INTO interacciones_foro (usuario_id, post_id, tipo_interaccion)
                VALUES (?, ?, 'like')
            `, [req.alumno.usuario_id, postId]);

            await db.execute(`
                UPDATE foro_posts 
                SET likes = likes + 1
                WHERE id = ?
            `, [postId]);

            res.json({
                success: true,
                message: 'Like agregado'
            });
        }
    } catch (error) {
        console.error('Error al dar like:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});

router.post('/foro/comentarios/:comentarioId/like', verifyTokenEstudiante, async (req, res) => {
    try {
        const { comentarioId } = req.params;

        const [existingLike] = await db.execute(`
            SELECT id FROM interacciones_foro 
            WHERE usuario_id = ? AND comentario_id = ? AND tipo_interaccion = 'like'
        `, [req.alumno.usuario_id, comentarioId]);

        if (existingLike.length > 0) {
            await db.execute(`
                DELETE FROM interacciones_foro 
                WHERE usuario_id = ? AND comentario_id = ? AND tipo_interaccion = 'like'
            `, [req.alumno.usuario_id, comentarioId]);

            await db.execute(`
                UPDATE foro_comentarios 
                SET likes = GREATEST(0, likes - 1)
                WHERE id = ?
            `, [comentarioId]);

            res.json({
                success: true,
                message: 'Like removido del comentario'
            });
        } else {
            await db.execute(`
                INSERT INTO interacciones_foro (usuario_id, comentario_id, tipo_interaccion)
                VALUES (?, ?, 'like')
            `, [req.alumno.usuario_id, comentarioId]);

            await db.execute(`
                UPDATE foro_comentarios 
                SET likes = likes + 1
                WHERE id = ?
            `, [comentarioId]);

            res.json({
                success: true,
                message: 'Like agregado al comentario'
            });
        }
    } catch (error) {
        console.error('Error al dar like al comentario:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
});
export default router;