#!/bin/bash
# FFmpeg installation script for AWS Linux (Amazon Linux 2 / Ubuntu)
# Run with: sudo bash install_ffmpeg.sh

set -e

echo "=================================================="
echo "FFmpeg Installation for Video Monitoring System"
echo "=================================================="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo "Cannot detect OS"
    exit 1
fi

install_ubuntu_debian() {
    echo "Installing FFmpeg on Ubuntu/Debian..."
    apt-get update
    apt-get install -y software-properties-common
    add-apt-repository -y ppa:jonathonf/ffmpeg-4
    apt-get update
    apt-get install -y ffmpeg
}

install_amazon_linux_2() {
    echo "Installing FFmpeg on Amazon Linux 2/2023 (compiling from source)..."
    
    # Check if amazon-linux-extras exists (AL2 only)
    if command -v amazon-linux-extras &> /dev/null; then
        amazon-linux-extras enable epel
        yum install -y epel-release
    fi
    
    # Install dependencies (use dnf for AL2023, yum for AL2)
    PKG_MGR="yum"
    if command -v dnf &> /dev/null; then
        PKG_MGR="dnf"
    fi
    
    $PKG_MGR install -y \
        autoconf \
        automake \
        bzip2 \
        cmake \
        freetype-devel \
        gcc \
        gcc-c++ \
        git \
        libtool \
        make \
        nasm \
        pkgconfig \
        zlib-devel \
        openssl-devel
    
    # Create ffmpeg source directory
    mkdir -p /opt/ffmpeg_sources
    cd /opt/ffmpeg_sources
    
    # Install NASM (assembler for x264)
    curl -O -L https://www.nasm.us/pub/nasm/releasebuilds/2.15.05/nasm-2.15.05.tar.bz2
    tar xjvf nasm-2.15.05.tar.bz2
    cd nasm-2.15.05
    ./autogen.sh
    ./configure --prefix="/usr/local" --bindir="/usr/local/bin"
    make -j$(nproc)
    make install
    cd ..
    
    # Install Yasm (alternative assembler)
    curl -O -L https://www.tortall.net/projects/yasm/releases/yasm-1.3.0.tar.gz
    tar xzvf yasm-1.3.0.tar.gz
    cd yasm-1.3.0
    ./configure --prefix="/usr/local" --bindir="/usr/local/bin"
    make -j$(nproc)
    make install
    cd ..
    
    # Install x264
    git clone --depth 1 https://code.videolan.org/videolan/x264.git
    cd x264
    PKG_CONFIG_PATH="/usr/local/lib/pkgconfig" ./configure --prefix="/usr/local" --bindir="/usr/local/bin" --enable-shared
    make -j$(nproc)
    make install
    cd ..
    
    # Install x265
    git clone --depth 1 https://bitbucket.org/multicoreware/x265_git.git
    cd x265_git/build/linux
    cmake -G "Unix Makefiles" -DCMAKE_INSTALL_PREFIX="/usr/local" -DENABLE_SHARED=on ../../source
    make -j$(nproc)
    make install
    cd /opt/ffmpeg_sources
    
    # Install libfdk-aac
    git clone --depth 1 https://github.com/mstorsjo/fdk-aac
    cd fdk-aac
    autoreconf -fiv
    ./configure --prefix="/usr/local" --disable-shared
    make -j$(nproc)
    make install
    cd ..
    
    # Install FFmpeg
    git clone --depth 1 https://github.com/FFmpeg/FFmpeg.git
    cd FFmpeg
    PKG_CONFIG_PATH="/usr/local/lib/pkgconfig" ./configure \
        --prefix="/usr/local" \
        --extra-cflags="-I/usr/local/include" \
        --extra-ldflags="-L/usr/local/lib" \
        --bindir="/usr/local/bin" \
        --enable-gpl \
        --enable-libfdk-aac \
        --enable-libx264 \
        --enable-libx265 \
        --enable-nonfree \
        --enable-openssl
    make -j$(nproc)
    make install
    
    # Update library cache
    echo "/usr/local/lib" > /etc/ld.so.conf.d/ffmpeg.conf
    ldconfig
}

install_amazon_linux_2023() {
    echo "Installing FFmpeg on Amazon Linux 2023..."
    
    # Amazon Linux 2023 method - compile from source
    # This ensures we have all needed codecs
    install_amazon_linux_2
}

# Install based on OS
case $OS in
    ubuntu|debian)
        install_ubuntu_debian
        ;;
    amzn)
        if [[ $VERSION_ID == "2" ]]; then
            install_amazon_linux_2
        elif [[ $VERSION_ID == "2023" ]]; then
            install_amazon_linux_2023
        else
            echo "Unsupported Amazon Linux version: $VERSION_ID"
            exit 1
        fi
        ;;
    centos|rhel)
        install_amazon_linux_2
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

# Verify installation
echo ""
echo "=================================================="
echo "Verifying FFmpeg installation..."
echo "=================================================="

if command -v ffmpeg &> /dev/null; then
    ffmpeg -version | head -n 1
    echo "✓ FFmpeg installed successfully!"
else
    echo "✗ FFmpeg installation failed!"
    exit 1
fi

echo ""
echo "Installation complete!"

