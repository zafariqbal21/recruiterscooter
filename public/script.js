
document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('uploadForm');
    const resultsSection = document.getElementById('results');
    const uploadResults = document.getElementById('uploadResults');

    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData();
        const fileInput = document.getElementById('recruitmentData');
        
        if (!fileInput.files[0]) {
            alert('Please select a file');
            return;
        }

        formData.append('recruitmentData', fileInput.files[0]);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                displayResults(result);
                loadAnalytics();
            } else {
                displayError(result.error);
            }
        } catch (error) {
            displayError('Upload failed: ' + error.message);
        }
    });

    function displayResults(result) {
        uploadResults.className = '';
        uploadResults.innerHTML = `
            <h3>Upload Successful!</h3>
            <p><strong>File:</strong> ${result.filename}</p>
            <p><strong>Rows processed:</strong> ${result.rowCount}</p>
            ${result.preview ? `
                <details>
                    <summary>Data Preview (first 5 rows)</summary>
                    <pre>${JSON.stringify(result.preview, null, 2)}</pre>
                </details>
            ` : ''}
        `;
        resultsSection.style.display = 'block';
    }

    function displayError(error) {
        uploadResults.className = 'error';
        uploadResults.innerHTML = `
            <h3>Upload Failed</h3>
            <p>${error}</p>
        `;
        resultsSection.style.display = 'block';
    }

    async function loadAnalytics() {
        try {
            const response = await fetch('/api/analytics');
            const data = await response.json();
            
            if (data.sampleMetrics) {
                document.getElementById('totalApplications').textContent = data.sampleMetrics.totalApplications;
                document.getElementById('hiredCandidates').textContent = data.sampleMetrics.hiredCandidates;
                document.getElementById('avgTimeToHire').textContent = data.sampleMetrics.averageTimeToHire + ' days';
            }
        } catch (error) {
            console.error('Failed to load analytics:', error);
        }
    }

    // Load initial analytics
    loadAnalytics();
});
