const apiKey = 'AIzaSyCb8Vpb1Nu1FGHU02-wxVimkPxlQZ0L_Co';

async function listModels() {
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;
    const response = await fetch(url);
    const data = await response.json();

    console.log('Available Models:');
    data.models.forEach(m => console.log(m.name));
}

listModels();
