function renderLinks() {
    const searchTerm = document.getElementById('searchBar').value.toLowerCase();
    const listContainer = document.getElementById('linkList');
    const countDisplay = document.getElementById('countDisplay');
    
    // Safety check to ensure myFiles and display elements exist
    if (!listContainer || typeof myFiles === 'undefined') return;

    // Update the counter text
    countDisplay.innerText = myFiles.length + " Files Available";
    
    listContainer.innerHTML = ""; 

    myFiles.forEach(file => {
        if (file.name.toLowerCase().includes(searchTerm)) {
            const card = document.createElement('div');
            card.className = 'download-card';
            
            card.onclick = function() {
                window.open(adsterraLink, '_blank');
                setTimeout(() => {
                    window.location.href = file.url;
                }, 800);
            };
            
            card.innerHTML = `
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">SIZE: ${file.size}</span>
                </div>
                <div class="dl-icon">Download</div>
            `;
            listContainer.appendChild(card);
        }
    });
}

// This makes sure the counter and list update as soon as the page is ready
window.onload = renderLinks;
