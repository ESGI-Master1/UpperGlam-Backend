export const getResetPasswordEmailTemplate = (
  resetPasswordUrl: string,
  resetCode: string,
  expirationInMinutes: number
) => `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Réinitialisation de votre mot de passe</title>
    <style>
        body {
            background-color: #0B0B0C;
            color: #F5F5F5;
            font-family: 'Inter', sans-serif;
            margin: 0;
            padding: 0;
            text-align: center;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 20px;
            background-color: #111114;
            border-radius: 8px;
            border: 1px solid #1a1a1c;
        }
        h1 {
            color: #D6B36A;
            font-family: 'Playfair Display', serif;
            font-size: 28px;
            margin-bottom: 24px;
        }
        p {
            color: #B9B9B9;
            font-size: 16px;
            line-height: 1.6;
            margin-bottom: 20px;
        }
        .cta {
            display: inline-block;
            background-color: #D6B36A;
            color: #0B0B0C;
            text-decoration: none;
            font-weight: bold;
            border-radius: 6px;
            padding: 12px 20px;
            margin: 16px 0;
        }
        .code {
            font-size: 28px;
            letter-spacing: 6px;
            font-weight: bold;
            color: #D6B36A;
            margin: 12px 0 22px;
        }
        .footer {
            margin-top: 40px;
            font-size: 12px;
            color: #555555;
            border-top: 1px solid #1a1a1c;
            padding-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Réinitialisez votre mot de passe</h1>
        <p>
            Vous avez demandé la réinitialisation de votre mot de passe Upper Glam.
        </p>
        <p>
            Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
            Ce lien est valide pendant ${expirationInMinutes} minute(s).
        </p>
        <p>
            Si vous êtes sur mobile, vous pouvez aussi entrer ce code :
        </p>
        <div class="code">${resetCode}</div>
        <a class="cta" href="${resetPasswordUrl}" target="_blank" rel="noopener noreferrer">
            Réinitialiser mon mot de passe
        </a>
        <p>
            Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.
        </p>
        <div class="footer">
            &copy; 2026 Upper Glam. Tous droits réservés.
        </div>
    </div>
</body>
</html>
`
