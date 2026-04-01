export const getPasswordChangedConfirmationEmailTemplate = () => `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mot de passe modifié</title>
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
        <h1>Votre mot de passe a été modifié</h1>
        <p>
            Nous confirmons que le mot de passe de votre compte Upper Glam vient d'être mis à jour.
        </p>
        <p>
            Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement le support.
        </p>
        <div class="footer">
            &copy; 2026 Upper Glam. Tous droits réservés.
        </div>
    </div>
</body>
</html>
`
