#!/bin/bash

# Activar entorno virtual si existe
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Función de limpieza (matar subprocesos al salir)
cleanup() {
    echo "Deteniendo procesos..."
    pkill -P $$
    exit
}

trap cleanup SIGINT SIGTERM

# Iniciar Web API en segundo plano
echo "Iniciando Web API..."
python web_api.py &
WEB_PID=$!

# Esperar un poco a que cargue la API
sleep 2

# Iniciar el bot (Proceso principal)
echo "Iniciando Bot..."
python main.py

# Esperar a que los procesos terminen
wait $WEB_PID
