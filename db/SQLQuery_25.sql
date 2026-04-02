UPDATE Temporadas SET activa = 0;
UPDATE Temporadas SET activa = 1 
WHERE id = (SELECT MAX(id) FROM Temporadas WHERE nombre NOT LIKE '%AUDIT%');
SELECT id, nombre, activa FROM Temporadas ORDER BY id DESC;
