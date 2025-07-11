
export const detectarCicloEscolar = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; 
    
    let periodo;
    let numeroperiodo;
    
    if (month >= 1 && month <= 4) {
        periodo = 'ENE-ABR';
        numeroperiodo = 1;
    } else if (month >= 5 && month <= 8) {
        periodo = 'MAY-AGO';
        numeroperiodo = 2;
    } else {
        periodo = 'SEP-DIC';
        numeroperiodo = 3;
    }
    
    return {
        ciclo: `${year}-${numeroperiodo}`,
        periodo,
        año: year,
        numeroperiodo,
        descripcion: `${periodo} ${year}`
    };
};


export const generarCiclosDisponibles = () => {
    const cicloActual = detectarCicloEscolar();
    const ciclos = [];
    const años = [cicloActual.año, cicloActual.año + 1];
    if (cicloActual.numeroperiodo === 1) {
        años.unshift(cicloActual.año - 1);
    }
    años.forEach(año => {
        [1, 2, 3].forEach(periodo => {
            const periodoTexto = periodo === 1 ? 'ENE-ABR' : 
                                periodo === 2 ? 'MAY-AGO' : 'SEP-DIC';
            
            ciclos.push({
                valor: `${año}-${periodo}`,
                etiqueta: `${periodoTexto} ${año}`,
                periodo: periodoTexto,
                año: año,
                esCicloActual: año === cicloActual.año && periodo === cicloActual.numeroperiodo
            });
        });
    });
    ciclos.sort((a, b) => {
        if (a.año !== b.año) return b.año - a.año; 
        return b.valor.split('-')[1] - a.valor.split('-')[1]; 
    });
    
    return ciclos;
};

export const obtenerInfoCiclo = (cicloEscolar) => {
    if (!cicloEscolar) return null;
    
    const [año, periodo] = cicloEscolar.split('-');
    const periodoTexto = periodo === '1' ? 'ENE-ABR' : 
                        periodo === '2' ? 'MAY-AGO' : 'SEP-DIC';
    
    return {
        ciclo: cicloEscolar,
        año: parseInt(año),
        periodo: parseInt(periodo),
        periodoTexto,
        descripcion: `${periodoTexto} ${año}`
    };
};

export const validarCicloEscolar = (cicloEscolar) => {
    if (!cicloEscolar) return false;
    
    const regex = /^\d{4}-[123]$/;
    if (!regex.test(cicloEscolar)) return false;
    
    const [año, periodo] = cicloEscolar.split('-');
    const añoNum = parseInt(año);
    const periodoNum = parseInt(periodo);
    
    const añoActual = new Date().getFullYear();
    if (añoNum < añoActual - 2 || añoNum > añoActual + 2) return false;
    if (periodoNum < 1 || periodoNum > 3) return false;
    
    return true;
};

export const getCicloEscolarDefault = () => {
    return detectarCicloEscolar().ciclo;
};