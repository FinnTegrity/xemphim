        document.addEventListener('DOMContentLoaded', function() {
            const movieList = document.getElementById('movie-list');
            const movieDetail = document.getElementById('movie-detail');
            const videoContainer = document.getElementById('video-container');
            const searchInput = document.getElementById('searchInput');
            const searchButton = document.getElementById('searchButton');

            fetch('https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1')
                .then(response => response.json())
                .then(data => {
                    if (data.status) {
                        data.items.forEach(movie => {
                            const movieItem = document.createElement('div');
                            movieItem.className = 'movie-item';
                            const posterUrl = movie.poster_url.startsWith('http') ? movie.poster_url : `https://phimimg.com/${movie.poster_url}`;
                            movieItem.innerHTML = `
                                <img src="${posterUrl}" alt="${movie.name}">
                                <h3 title="${movie.name}">${movie.name}</h3>
                                <p>${movie.year}</p>
                            `;
                            movieItem.addEventListener('click', () => showMovieDetail(movie.slug));
                            movieList.appendChild(movieItem);
                        });
                    }
                });

                function showMovieDetail(slug) {
    fetch(`https://phimapi.com/phim/${slug}`)
        .then(response => response.json())
        .then(data => {
            if (data.status) {
                const movie = data.movie;
                const episodes = data.episodes;
                const posterUrl = movie.poster_url.startsWith('http') ? movie.poster_url : `https://phimimg.com/${movie.poster_url}`;
                movieDetail.innerHTML = `
                    <h2>${movie.name}</h2>
                    <img src="${posterUrl}" alt="${movie.name}">
                    <p>${movie.content}</p>
                `;
                const episodeList = document.createElement('div');
                episodeList.className = 'episode-list';
                episodes.forEach(episode => {
                    episode.server_data.forEach(server => {
                        const episodeItem = document.createElement('div');
                        episodeItem.className = 'episode-item';
                        episodeItem.textContent = server.name;
                        episodeItem.addEventListener('click', () => watchMovie(server.link_embed, episodeList));
                        episodeList.appendChild(episodeItem);
                    });
                });
                movieDetail.appendChild(episodeList);

                // Cuộn trang xuống phần giới thiệu phim
                movieDetail.scrollIntoView({ behavior: 'smooth' });
            }
        });
}

            function watchMovie(embedUrl, episodeList) {
                videoContainer.innerHTML = `
                    <iframe src="${embedUrl}" width="100%" height="500px" frameborder="0" allowfullscreen></iframe>
                `;
                videoContainer.appendChild(episodeList);
            }

            function searchMovies(keyword) {
                fetch(`https://phimapi.com/v1/api/tim-kiem?keyword=${keyword}`)
                    .then(response => response.json())
                    .then(data => {
                        displayMovies(data.data.items);
                    })
                    .catch(error => console.error('Lỗi tìm kiếm phim:', error));
            }

            function displayMovies(movies) {
                movieList.innerHTML = '';
                movies.forEach(movie => {
                    const movieItem = document.createElement('div');
                    movieItem.className = 'movie-item';
                    const posterUrl = movie.poster_url.startsWith('http') ? movie.poster_url : `https://phimimg.com/${movie.poster_url}`;
                    movieItem.innerHTML = `
                        <img src="${posterUrl}" alt="${movie.name}">
                        <h3 title="${movie.name}">${movie.name}</h3>
                    `;
                    movieItem.addEventListener('click', () => showMovieDetail(movie.slug));
                    movieList.appendChild(movieItem);
                });
            }

            searchButton.addEventListener('click', () => {
                const keyword = searchInput.value.trim();
                if (keyword) {
                    searchMovies(keyword);
                }
            });
             // Thêm sự kiện nhấn phím "Enter" để tìm kiếm
    searchInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            const keyword = searchInput.value.trim();
            if (keyword) {
                searchMovies(keyword);
            }
        }
    });
        });
