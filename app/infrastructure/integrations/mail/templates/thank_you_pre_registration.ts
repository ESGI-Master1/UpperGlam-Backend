export const getThankYouEmailTemplate = (username: string) => `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bienvenue chez Upper Glam</title>
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
        .accent {
            color: #D6B36A;
            font-weight: bold;
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
        <h1>Merci de votre intérêt, ${username} !</h1>
        <p>
            Nous avons bien reçu votre demande de pré-inscription pour <span class="accent">Upper Glam</span>.
        </p>
        <p>
            Toute l'équipe vous remercie de l'intérêt que vous portez à notre projet. 
            C'est grâce à des personnes passionnées comme vous que nous construisons le futur de la beauté.
        </p>
        <p>
            Nous vous recontacterons personnellement dès le lancement officiel du projet pour vous donner accès à la plateforme en priorité.
        </p>
        <p>
            À très bientôt,<br>
            L'équipe Upper Glam
        </p>
        <div class="footer">
            &copy; 2026 Upper Glam. Tous droits réservés.
        </div>
    </div>
</body>
</html>
`
