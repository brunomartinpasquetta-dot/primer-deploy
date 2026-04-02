CREATE TABLE Usuarios (
  id            INT PRIMARY KEY IDENTITY,
  nombre        NVARCHAR(100) NOT NULL,
  usuario       NVARCHAR(50) NOT NULL UNIQUE,
  password_hash NVARCHAR(255) NOT NULL,
  rol           NVARCHAR(20) NOT NULL DEFAULT 'encargado',
  activo        BIT DEFAULT 1,
  creado_en     DATETIME DEFAULT GETDATE()
);

-- Usuario admin por defecto (password: admin123)
INSERT INTO Usuarios (nombre, usuario, password_hash, rol)
VALUES ('Administrador', 'admin', 
'$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 
'administrador');