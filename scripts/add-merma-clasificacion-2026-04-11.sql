-- Agregar columna merma_clasificacion a LotesMercaderia
-- Captura la diferencia entre kg enviados a clasificación y kg clasificados al cierre
ALTER TABLE LotesMercaderia
  ADD merma_clasificacion DECIMAL(10,3) NOT NULL DEFAULT 0;
