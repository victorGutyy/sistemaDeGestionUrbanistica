# Abre un .docx con Word, actualiza la tabla de contenido y los números de página, lo guarda y (opcional) exporta el PDF.
#   powershell -File postprocesar.ps1 -Docx "ruta.docx" [-Pdf "ruta.pdf"]
param(
  [Parameter(Mandatory = $true)][string]$Docx,
  [string]$Pdf = ''
)
$ErrorActionPreference = 'Stop'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($Docx)
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Fields.Update() | Out-Null
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $paginas = $doc.ComputeStatistics(2)
  $doc.Save()
  if ($Pdf -ne '') {
    $doc.ExportAsFixedFormat($Pdf, 17)
  }
  Write-Output "Listo: $paginas paginas"
  $doc.Close(0)
}
finally {
  $word.Quit()
}
