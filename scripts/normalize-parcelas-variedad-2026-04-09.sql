-- Normalizar Parcelas.variedad (texto libre) a FK contra variedades_frutilla
-- Match case-insensitive: CAMAROSA→6, FESTIVAL→12
-- La columna variedad texto se mantiene como fallback temporal

ALTER TABLE Parcelas ADD variedad_id INT NULL;

UPDATE Parcelas
SET variedad_id = vf.id
FROM Parcelas p
INNER JOIN variedades_frutilla vf ON UPPER(LTRIM(RTRIM(p.variedad))) = UPPER(LTRIM(RTRIM(vf.nombre)));

-- Verificar 0 huérfanos
-- SELECT COUNT(*) FROM Parcelas WHERE variedad_id IS NULL AND variedad IS NOT NULL;

ALTER TABLE Parcelas ADD CONSTRAINT FK_Parcelas_Variedad
  FOREIGN KEY (variedad_id) REFERENCES variedades_frutilla(id);

CREATE INDEX IX_Parcelas_variedad_id ON Parcelas(variedad_id);
