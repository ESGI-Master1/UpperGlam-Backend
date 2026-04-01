export const getPreRegistrationApprovedTemplate = (firstName: string) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pré-inscription validée</title>
</head>
<body style="background:#0B0B0C;color:#F5F5F5;font-family:Arial,sans-serif;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#111114;border:1px solid #1a1a1c;border-radius:8px;padding:24px;">
    <h1 style="color:#D6B36A;margin:0 0 16px;">Bonjour ${firstName},</h1>
    <p style="line-height:1.6;color:#D6D6D6;">
      Votre pré-inscription Upper Glam a été validée.
    </p>
    <p style="line-height:1.6;color:#D6D6D6;">
      Vous pouvez maintenant vous connecter à votre compte et accéder à la plateforme.
    </p>
    <p style="line-height:1.6;color:#D6D6D6;">
      À très bientôt,<br>
      L'équipe Upper Glam
    </p>
  </div>
</body>
</html>
`
