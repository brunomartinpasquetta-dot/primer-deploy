ALTER TABLE Cheques ADD tipo_cheque NVARCHAR(20) DEFAULT 'fisico';
ALTER TABLE Cheques ADD id_echeq NVARCHAR(50) NULL;
ALTER TABLE Cheques ADD cbu_origen NVARCHAR(30) NULL;
ALTER TABLE Cheques ADD cuit_emisor NVARCHAR(15) NULL;

CREATE TABLE Personal (
  id INT PRIMARY KEY IDENTITY,
  nombre NVARCHAR(100) NOT NULL, apellido NVARCHAR(100) NOT NULL,
  tipo_documento NVARCHAR(20) DEFAULT 'DNI', documento NVARCHAR(20),
  cuil NVARCHAR(15), fecha_nacimiento DATE, nacionalidad NVARCHAR(50),
  telefono NVARCHAR(30), email NVARCHAR(100),
  direccion NVARCHAR(200), localidad NVARCHAR(100),
  tipo_contrato NVARCHAR(50), fecha_ingreso DATE, fecha_egreso DATE,
  activo BIT DEFAULT 1, observaciones NVARCHAR(500),
  juntador_id INT NULL, creado_en DATETIME DEFAULT GETDATE()
);
