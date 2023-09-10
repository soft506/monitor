const axios = require('axios');
const cron = require('node-cron');
const { DateTime } = require('luxon');

const logsEndpoint = "https://db.click2order.app:7777/api/logs";
const configsEndpoint = "https://db.click2order.app:7777/api/configs/";

let monitorInterval = 5; // Cambiado a 5 segundos

// Mapeo de palabras clave en el contenido de errores a logType
const errorKeywords = {
  "ECONNREFUSED": "connectionError",
  "unable to verify the first certificate": "certificateError",
  // Agrega más palabras clave y logTypes según sea necesario
};

const fetchDists = async () => {
  try {
    const response = await axios.get("https://db.click2order.app:7777/api/dists");
    return response.data;
  } catch (error) {
    console.error("Error al obtener la lista de dists:", error.message);
    return [];
  }
};

const fetchData = async (dist) => {
  const url = `${dist.url}webapi/articulos/getlista`;
  try {
    const response = await axios.get(url);
    // Aquí puedes manejar la respuesta exitosa si es necesario
  } catch (error) {
    let logType = "unknownError"; // Valor predeterminado si no se encuentra una palabra clave
    
    // Buscar palabras clave en el contenido del error
    for (const keyword in errorKeywords) {
      if (error.message.includes(keyword)) {
        logType = errorKeywords[keyword];
        break; // Si se encuentra una coincidencia, salir del bucle
      }
    }

    const errorData = {
      description: error.message,
      date: DateTime.now().toString(),
      distName: dist.name,
      url: url,
      logType: logType // Agregar el logType al registro de error
    };
    try {
      await axios.post(logsEndpoint, errorData);
      console.log(`Error (${logType}) registrado en los logs:`, error.message);
    } catch (logError) {
      console.error("Error al registrar el error en los logs:", logError.message);
    }
  }
};

const startScheduledTask = async () => {
  while (true) {
    try {
      let countdown = monitorInterval; // Inicializa el contador con el valor actual de monitorInterval

      console.log(`Ejecutando tarea programada cada ${monitorInterval} segundos...`);

      const dists = await fetchDists();
      if (dists.length === 0) {
        console.log('No se encontraron dists para procesar.');
        return;
      }

      const countdownInterval = setInterval(() => {
        console.clear();
        console.log(`Iniciando en ${countdown} segundos...`);
        countdown--;

        if (countdown === 0) {
          clearInterval(countdownInterval); // Detiene la cuenta regresiva
          console.log(`Ejecutando tarea programada...`);
          dists.forEach((dist) => {
            fetchData(dist);
          });
        }
      }, 1000); // Actualiza cada segundo

      // Actualizar el valor de monitorInterval consultando el endpoint de configuración
      const response = await axios.get(configsEndpoint);
      monitorInterval = response.data[0]?.monitorInterval || monitorInterval;
      console.log(`MonitorInterval actualizado a ${monitorInterval} segundos.`);
    } catch (error) {
      console.error("Error al obtener el valor de monitorInterval:", error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, monitorInterval * 1000)); // Esperar el nuevo monitorInterval
  }
};

startScheduledTask();
