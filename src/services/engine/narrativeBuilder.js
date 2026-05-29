/**
 * Builder for narrative arguments and Peruvian translations
 */
export   const translateToPeruvian = (text) => {
    if (!text) return text;
    let p = text;
    
    // Términos técnicos → Coloquiales
    p = p.replace(/Poisson indica/gi, "La calculadora me dice que");
    p = p.replace(/superior en forma efectiva/gi, "viene más embalado");
    p = p.replace(/claramente superior/gi, "está en su salsa");
    p = p.replace(/inferior/gi, "viene medio golpeado");
    p = p.replace(/Protección ante el empate/gi, "por si las moscas, nos cubrimos con el empate");
    p = p.replace(/Probabilidad/gi, "Chance");
    p = p.replace(/proyecta/gi, "pinta para");
    p = p.replace(/histórico/gi, "de toda la vida");
    p = p.replace(/ventaja/gi, "está un paso adelante");
    p = p.replace(/Value Bet/gi, "¡Fierrazo con cuota de regalo!");
    p = p.replace(/el mercado paga/gi, "la casa de apuestas se ha palteado y paga");
    p = p.replace(/nosotros proyectamos/gi, "nosotros le tenemos más fe y vemos un");
    p = p.replace(/Zona Descenso/gi, "Están con el agua al cuello");
    p = p.replace(/máxima tensión táctica/gi, "se juegan el pellejo");
    p = p.replace(/baja anotación/gi, "partido bien tacaño con los goles");
    p = p.replace(/Dixon-Coles confirma/gi, "las matemáticas me dan la razón");
    p = p.replace(/Doble confirmación/gi, "está recontra asegurado");
    p = p.replace(/Potencial ofensivo/gi, "están con la mecha prendida");
    p = p.replace(/defensa sólida/gi, "están bien parados atrás");
    p = p.replace(/se juegan mucho/gi, "están que queman");
    p = p.replace(/Cuota de valor/gi, "Está para aprovecharla");
    p = p.replace(/remontada/gi, "volteada");
    p = p.replace(/apostar/gi, "meterle unas fichas");
    p = p.replace(/está de relajo/gi, "está en modo vacaciones");
    p = p.replace(/ya son campeones/gi, "ya campeonaron, juegan por cumplir");
    p = p.replace(/Urgencia máxima/gi, "Están desesperados por los puntos");

    // Muletillas peruanas al inicio o final (probabilístico para variedad)
    const filler = ["Sobrino, ", "Habla, ", "Mira, ", "Te canto la fija: ", "Ojo ahí, ", "Atento, "];
    const ender = [". ¡Aprovecha!", ". Está cantado.", ". ¡No seas sano!", ". Es un fierrazo.", ". ¡Gente, ahí está el billete!", ". Vamos con todo."];
    
    if (!p.includes("Sobrino") && Math.random() > 0.4) {
      p = filler[Math.floor(Math.random() * filler.length)] + p;
    }
    if (Math.random() > 0.4) {
      p = p + ender[Math.floor(Math.random() * ender.length)];
    }

    return p;
  };

  // ── Constructor de Argumento Narrativo en Lenguaje Sencillo ─────
  // Genera una explicación de 1-2 líneas en español coloquial peruano
  // basada en el contexto real del partido (motivación, jerarquía, forma).

export   const buildNarrativeArgument = (market, selection) => {
    const home = homeTeamName;
    const away = awayTeamName;
    const homeStar  = isHomeHierarchy;
    const awayStar  = isAwayHierarchy;
    const homeUrgent = homeMotivNote.toLowerCase().includes('urgencia') || homeContextNote.toLowerCase().includes('urgencia');
    const awayUrgent = awayMotivNote.toLowerCase().includes('urgencia') || awayContextNote.toLowerCase().includes('urgencia');
    const homeStrong  = homeEffectiveScore >= 65;
    const awayStrong  = awayEffectiveScore >= 65;
    const homeTired   = homeRest.label.includes('Cansancio') || homeRest.label.includes('Poco');
    const awayTired   = awayRest.label.includes('Cansancio') || awayRest.label.includes('Poco');
    const homeInjured = homeInjuries > 0;
    const awayInjured = awayInjuries > 0;
    const bigGoals    = projectedGoals >= 2.8;
    const lowGoals    = projectedGoals <= 2.0;
    const isChampion  = awayContextNote.toLowerCase().includes('campe') || homeContextNote.toLowerCase().includes('campe');
    const relegZone   = laLigaRelegationZone ||
                        homeContextNote.toLowerCase().includes('descenso') ||
                        awayContextNote.toLowerCase().includes('descenso') ||
                        homeUrgent || awayUrgent;

    // Piezas de contexto reutilizables
    const urgencyLine = homeUrgent
      ? `${home} se juega el pellejo en esta cancha — necesita los puntos sí o sí.`
      : awayUrgent
        ? `${away} llega con el agua al cuello y va a salir a buscar el resultado a como dé lugar.`
        : '';
    const hierarchyLine = (homeStar && !awayStrong)
      ? `${home} es un equipo grande; aunque el rival lo intente, la jerarquía suele pesar.`
      : (awayStar && !homeStrong)
        ? `${away} viene con más calidad encima y eso se nota cuando el partido se complica.`
        : '';
    const fatigueLine = homeTired
      ? `${home} viene con las piernas pesadas, jugó hace muy poco.`
      : awayTired
        ? `${away} llega cansado — jugó hace poquísimos días y eso se siente en el segundo tiempo.`
        : '';
    const injuryLine = homeInjured
      ? `${home} tiene bajas importantes en su alineación.`
      : awayInjured
        ? `${away} no viene completo; le faltan jugadores clave.`
        : '';
    const relaxLine = isChampion
      ? `Un equipo ya campeonó y hoy sale a cumplir — sin esa hambre que te da jugarte algo importante.`
      : '';

    // ── Narrativas por mercado ──────────────────────────────────────
    const sel = (selection || '').toLowerCase();
    const goalsNote = bigGoals
      ? `El modelo proyecta unos ${projectedGoals} goles en total, lo cual es bastante.`
      : lowGoals
        ? `El modelo solo espera ${projectedGoals} goles en total, así que el partido pinta cerrado.`
        : `El modelo proyecta alrededor de ${projectedGoals} goles en total.`;

    // Doble Oportunidad X2
    if (market === 'Doble Oportunidad' && sel.includes('x2')) {
      if (relaxLine && urgencyLine) {
        return `${relaxLine} ${urgencyLine} En ese escenario, el visitante puede salir a especular y el empate se convierte en un resultado muy probable. La apuesta X2 te cubre tanto si el visitante gana como si empatan, dándote dos oportunidades de cobrar en lugar de una sola.`;
      }
      if (awayStar) {
        return `${hierarchyLine} Aunque ${home} empuje de local, el visitante tiene el nivel suficiente para al menos no perder. ${fatigueLine || ''} Con esta apuesta ganas si el partido termina en empate o con victoria del visitante — no necesitas que gane con autoridad, basta con que no pierda.`.trim();
      }
      return `El visitante llega en un buen momento y fuera de casa también sabe rendir. Un empate siempre es posible en este tipo de partidos y esta apuesta te protege de eso. ${goalsNote} Con el X2 tienes dos de los tres resultados posibles a tu favor.`;
    }

    // Doble Oportunidad 1X
    if (market === 'Doble Oportunidad' && sel.includes('1x')) {
      if (homeUrgent) {
        return `${home} necesita los puntos con urgencia y eso se nota en cómo un equipo sale al campo — con más intensidad, más presión y más ganas de no ceder. Cuando un equipo pelea por la tabla de local, raramente pierde. La apuesta 1X te cubre tanto si gana como si empatan, así que si el partido se tranca y no hay ganador claro, igual cobras.`;
      }
      if (homeStar) {
        return `${hierarchyLine} De local y con su gente en las tribunas, ${home} tiene un piso de rendimiento muy alto — es muy difícil que salga de su cancha sin nada. ${fatigueLine || ''} La 1X te da dos resultados a tu favor: si gana cobras, si empata también. Solo pierdes si el visitante da el golpe de gracia.`.trim();
      }
      return `${home} está bien en casa esta temporada y el partido pinta trabado. La 1X es la apuesta más inteligente cuando no estás seguro del resultado exacto pero sí confías en que el local no debería perder. ${goalsNote} Si el partido se pone difícil, el empate es siempre el "salvavidas" del local.`;
    }

    // Más de 1.5 goles
    if (market === 'Total de Goles' && sel.includes('1.5') && sel.includes('más')) {
      if (bigGoals) {
        return `Ambos equipos vienen anotando con regularidad y los números lo respaldan. ${goalsNote} Para que pierdas esta apuesta, el partido tendría que terminar 1-0 o 0-0 — y eso es bastante raro dado cómo viene el marcador promedio de los dos. Es una de las apuestas más "seguras" del mercado cuando ambos tienen ritmo goleador.`;
      }
      if (urgencyLine) {
        return `${urgencyLine} Cuando un equipo necesita los tres puntos, el partido se abre porque no puede jugar especulando. Eso suele generar más llegadas y más goles. ${goalsNote} Aunque solo necesitas 2 goles para ganar esta apuesta, lo más probable es que el partido tenga bastante más movimiento que eso.`;
      }
      return `Los dos equipos anotan con regularidad esta temporada. ${goalsNote} Que el partido termine 0-0 o 1-0 sería una rareza — los números nos dicen que casi siempre hay al menos dos goles cuando estos equipos juegan. Es la apuesta de menor riesgo dentro del mercado de goles.`;
    }

    // Más de 2.5 goles
    if (market === 'Total de Goles' && sel.includes('2.5') && sel.includes('más')) {
      if (bigGoals && !relaxLine) {
        return `Los dos equipos atacan bien y ninguno defiende de manera sólida. ${goalsNote} Que el partido tenga 3 o más goles es el escenario más esperado — no sería ninguna sorpresa. ${urgencyLine || ''} Esta es una apuesta que el modelo recomienda cuando la proyección de goles supera claramente el umbral de 2.5.`.trim();
      }
      if (relaxLine) {
        return `${relaxLine} Sin embargo, el otro equipo sí tiene motivos para atacar y va a salir a buscar el resultado. Eso abre espacios y los goles suelen aparecer cuando uno empuja y el otro especula. ${goalsNote} Con 3 goles o más, esta apuesta cierra.`;
      }
      return `El partido pinta para ir de ida y vuelta. ${goalsNote} Con los promedios de gol de ambos, 3 tantos o más es el resultado más natural. Esta apuesta tiene sentido cuando los dos equipos llegan con buen ritmo ofensivo y sin necesidad de cerrarse atrás.`;
    }

    // Menos de 2.5 goles
    if (market === 'Total de Goles' && sel.includes('2.5') && sel.includes('menos')) {
      if (relegZone) {
        return `Cuando uno o los dos equipos están peleando el descenso, el partido cambia completamente de carácter. Se juegan demasiado como para arriesgarse — se cierran atrás, cuidan el resultado y atacan solo con garantías. ${goalsNote} En ese tipo de partidos los goles escasean y el Under 2.5 tiene mucho valor.`;
      }
      if (lowGoals) {
        return `Ninguno de los dos anota mucho esta temporada — son equipos que cuidan más el arco que el ataque. ${goalsNote} Un partido trabado y cerrado es lo más probable acá. La apuesta Under 2.5 gana si el partido termina 0-0, 1-0, 0-1, 1-1 o 2-0/0-2.`;
      }
      return `Los dos equipos llegan con la cabeza más en el resultado que en hacer un espectáculo. ${goalsNote} Se esperan pocas llegadas claras y el partido tiene pinta de definirse con poco margen. Under 2.5 es una apuesta táctica para partidos donde ninguno se suele ir al ataque sin control.`;
    }

    // Más de 3.5 goles
    if (market === 'Total de Goles' && sel.includes('3.5')) {
      return `El partido pinta para una fiesta de goles. ${goalsNote} ${urgencyLine || ''} Ambos equipos atacan con ritmo y las defensas de los dos dejan espacios. Con 4 goles o más, esta apuesta cierra — y según los números no es una locura pedirlo. Es el mercado ideal cuando el modelo proyecta un partido muy abierto.`.trim();
    }

    // Victoria Local
    if (market === 'Ganador del Partido' && sel.includes('local')) {
      const ctx = [urgencyLine, hierarchyLine, fatigueLine ? `Por si fuera poco, ${fatigueLine.toLowerCase()}` : '', injuryLine ? `Además, ${injuryLine.toLowerCase()}` : ''].filter(Boolean);
      if (ctx.length > 0) {
        return `${ctx.join(' ')} ${goalsNote} Todos estos factores juntos apuntan a ${home} como el favorito claro del partido hoy.`;
      }
      return `${home} está en un gran momento y de local se le ve sólido. ${goalsNote} Sus números en casa esta temporada respaldan que hoy puede ganar — tiene la forma, el apoyo del público y el terreno conocido a su favor.`;
    }

    // Victoria Visitante
    if (market === 'Ganador del Partido' && sel.includes('visitante')) {
      const ctx = [urgencyLine || hierarchyLine, fatigueLine ? `Para colmo, ${fatigueLine.toLowerCase()}` : '', injuryLine ? `Y ${injuryLine.toLowerCase()}` : ''].filter(Boolean);
      if (ctx.length > 0) {
        return `${ctx.join(' ')} ${goalsNote} Con todo eso, ${away} llega como favorito y tiene los argumentos para llevarse los tres puntos de aquí.`;
      }
      return `${away} viene en racha y de visita también sabe rendir. ${goalsNote} El local no está en su mejor momento como para plantarle cara — los números del visitante fuera de casa esta temporada son muy buenos.`;
    }

    // Empate
    if (market === 'Ganador del Partido' && sel.includes('empate')) {
      if (relaxLine) {
        return `${relaxLine} En ese contexto, el empate no le viene mal a ninguno — uno porque no se la juega y el otro porque puede conformarse con el punto. ${goalsNote} Las matemáticas lo ven como el resultado más "neutral" del partido y la historia entre estos dos equipos también lo respalda.`;
      }
      return `Los dos equipos están bastante parejos en nivel esta temporada. Ninguno domina claramente al otro y el partido podría ir para cualquier lado. ${goalsNote} El empate es el resultado que aparece más frecuente en este tipo de enfrentamientos equilibrados — y el modelo lo recoge como una opción real.`;
    }

    // Ambos Marcan
    if (market === 'Ambos Marcan') {
      if (homeInjured || awayInjured) {
        return `${injuryLine} A pesar de eso, ambos equipos tienen jugadores que llegan al arco con regularidad y la costumbre de marcar en sus partidos. ${goalsNote} Esta apuesta no pide que haya muchos goles — solo que los dos equipos anoten al menos uno cada uno, y eso es algo que suele pasar con estos rivales.`;
      }
      return `Los dos equipos anotan seguido — tanto el local como el visitante tienen jugadores que generan peligro y terminan dentro del marcador. ${goalsNote} No se trata solo de que haya goles en el partido, sino de que los dos equipos aparezcan en el tablero. Según sus promedios, eso es lo más habitual.`;
    }

    // Handicap Asiático (Negativo: -0.5)
    if (market === 'Handicap Asiático') {
      // ── Handicap Positivo (+1.5 / +2.0): Protección al underdog ──
      if (sel.includes('+')) {
        const line = sel.includes('+2') ? '+2.0' : '+1.5';
        const protTeam = sel.toLowerCase().includes('visitante') ? away : home;
        const favTeam  = sel.toLowerCase().includes('visitante') ? home : away;
        if (line === '+2.0') {
          return `${protTeam} llega como el equipo más débil según las cuotas, pero no es un equipo que se deje golear fácilmente. Con el hándicap ${line}, solo pierdes la apuesta si ${favTeam} gana por 3 o más goles — algo poco frecuente. Si ${favTeam} gana por exactamente 2, te devuelven el dinero. Y si gana por 1, empatan o ${protTeam} gana, cobras. ${goalsNote} Es la forma más inteligente de respaldar al underdog sin arriesgar demasiado.`;
        }
        return `Con el hándicap ${line} le das una ventaja virtual de 1.5 goles a ${protTeam}. Eso significa que solo pierdes si ${favTeam} gana por 2 o más goles. Un resultado ajustado como 1-0 o 2-1 ya te da ganador. ${goalsNote} Es una apuesta defensiva que aprovecha la solidez del rival menos favorito.`;
      }
      // ── Handicap Negativo (-0.5): Favorito claro ──
      if (homeStar && sel.includes('local')) {
        return `${home} tiene demasiada jerarquía para conformarse con un empate acá. El handicap asiático -0.5 es más inteligente que apostar a la victoria directa: te da exactamente la misma lógica pero con una cuota más atractiva. ${goalsNote} Si ${home} gana, tú cobras — y según el análisis, ganar es lo que el modelo espera.`;
      }
      if (awayStar && sel.includes('visitante')) {
        return `${away} viene a buscar los tres puntos, no a especular con un empate. El handicap -0.5 del visitante te da la mejor cuota disponible para ese pronóstico. ${goalsNote} Si el visitante se lleva el partido — que es lo que el modelo anticipa — con el handicap cobras mejor que con el resultado directo.`;
      }
      return `Un equipo domina claramente en este análisis. El handicap asiático te permite apostar a esa superioridad con una cuota más jugosa que el 1X2 tradicional. ${goalsNote} Si el favorito gana como se espera, con el handicap siempre cobras mejor.`;
    }

    // Combo BTTS + Over
    if (market === 'Combo') {
      return `El partido tiene todos los ingredientes para un poco de todo: ataque de los dos lados, goles cruzados y bastante movimiento en el marcador. ${goalsNote} Es la apuesta "combinada" más completa: necesitas que ambos anoten y que en total haya 3 o más goles. Cuando el modelo proyecta un partido abierto, este combo tiene mucho sentido.`;
    }

    // Resultado en Vivo
    if (market === 'Resultado en Vivo') {
      const liveCtx = sel.includes('1x')
        ? `El equipo local tiene el carácter y la presión del marcador para reaccionar — es difícil que se quede con nada jugando de local.`
        : `El equipo que va perdiendo aún tiene tiempo y las condiciones del partido indican que puede reaccionar.`;
      return `Según cómo está el partido en este momento, las condiciones favorecen claramente este resultado. ${liveCtx} El motor ajusta las probabilidades minuto a minuto y en este instante ve una oportunidad real. No dejes pasar la cuota — en vivo cambia rápido.`;
    }

    // Goles en Vivo
    if (market === 'Goles en Vivo') {
      return `El partido ya entró en goles y quedan minutos con los dos equipos buscando el resultado. Cuando hay goles en la primera parte, las probabilidades de que vengan más en la segunda son altas — los equipos se abren y dejan espacios. El modelo calcula que todavía hay margen real para que caiga otro tanto. Entra mientras la cuota todavía es buena.`;
    }

    // Estrategia en Vivo
    if (market === 'Estrategia en Vivo') {
      return `Esta no es para entrarla ahorita — es una estrategia para tenerla lista y activarla si el partido llega a esa situación. Cuando se da ese escenario, la cuota sube mucho y ahí es donde está el valor real. El motor la detecta como una oportunidad potencial de alta recompensa. Monitorea el partido y entra en el momento exacto.`;
    }

    // Genérico
    return `El análisis de forma, jerarquía y contexto de ambos equipos apunta a este resultado como el más probable hoy. ${goalsNote} El motor lo identifica como una oportunidad clara después de cruzar los datos de los últimos partidos de los dos equipos.`;
  };



