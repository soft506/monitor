const axios = require('axios');
const { DateTime } = require('luxon');
const http = require('http');
const socketIo = require('socket.io');

const logsEndpoint = "https://db.click2order.app:7777/api/logs";
const configsEndpoint = "https://db.click2order.app:7777/api/configs/";

let monitorInterval = 5;

const errorKeywords = {
  "ECONNREFUSED": "connectionError",
  "unable to verify the first certificate": "certificateError",
};

const server = http.createServer();
const io = socketIo(server);

io.on('connection', (socket) => {
  console.log('Cliente conectado');
  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});

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
  } catch (error) {
    let logType = "unknownError";

    for (const keyword in errorKeywords) {
      if (error.message.includes(keyword)) {
        logType = errorKeywords[keyword];
        break;
      }
    }

    const errorData = {
      description: error.message,
      date: DateTime.now().toString(),
      distName: dist.name,
      url: url,
      logType: logType
    };

    try {
      const configResponse = await axios.get(configsEndpoint);
      const configData = configResponse.data[0];

      if (
        (logType === "connectionError" && configData.connectionError) ||
        (logType === "certificateError" && configData.certificateError)
      ) {
        await axios.post(logsEndpoint, errorData);
        console.log(`Error (${logType}) registrado en los logs:`, error.message);
      } else {
        console.log(`Error (${logType}) no registrado en los logs debido a la configuración.`);
      }
    } catch (logError) {
      console.error("Error al registrar el error en los logs:", logError.message);
    }
  }
};

const startScheduledTask = async () => {
  while (true) {
    try {
      let countdown = monitorInterval;
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
          clearInterval(countdownInterval);
          console.log(`Ejecutando tarea programada...`);
          dists.forEach((dist) => {
            fetchData(dist);
          });
        }
      }, 1000);

      const response = await axios.get(configsEndpoint);
      monitorInterval = response.data[0]?.monitorInterval || monitorInterval;
      console.log(`MonitorInterval actualizado a ${monitorInterval} segundos.`);

      socket.emit('consoleMessage', { message: `Ejecutando tarea programada cada ${monitorInterval} segundos...` });
      socket.emit('consoleMessage', { message: `MonitorInterval actualizado a ${monitorInterval} segundos.` });
    } catch (error) {
      console.error("Error al obtener el valor de monitorInterval:", error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, monitorInterval * 1000));
  }
};

server.listen(3000, () => {
  console.log('Servidor Socket.IO escuchando en el puerto 3000');
});

startScheduledTask();
