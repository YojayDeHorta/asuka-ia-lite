#!/bin/bash
# Script para iniciar el servidor web de Asuka
# Puerto: 8080

if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "⚠️  No se encontró entorno virtual 'venv', intentando python del sistema..."
fi

echo "🚀 Iniciando Asuka Web en http://localhost:8080..."
python3 web_api.py
